define(['./utils'],function(utils) {
	function test(f) {
		console.log('before');
		try {
			f();
		} catch(e) {
			console.log(e,e.stack);
		}
		console.log('after');
	}
	function NetworkServer(simulator) {
		this.simulator = simulator;
		this.clients = [];
		this.newclientid = 0;
		this.messageHandlers = {
			'syn': handleSyn,
			'ack': handleAck,
			'resetrequest': handleResetrequest
		};
		this.defaultgamerate = 1000*(1/30);
		this.gameupdateTimeout = setTimeout(update.bind(this), this.defaultgamerate);
	}
	function update() {
		this.simulator.updateGame();
		this.gameupdateTimeout = setTimeout(update.bind(this), this.defaultgamerate);
	}
	(function(p) {
		p.createClient = function(messenger) {
			var client = new Client();
			client.id = this.newclientid++;
			client.server = this;
			client.messenger = messenger;
			client.lastframe = this.simulator.getLastFrame();
			this.clients.push(client);

			// Initialize client.
			this.simulator.getLastTimeFrame().events.push({
				type: 'connect',
				clientid: client.id
			});
			client.broadcast({
				type: 'connect',
				clientid: client.id,
				frame: this.simulator.getLastFrame()
			});
			client.messenger.send({
				type: 'initialize',
				clientid: client.id,
				timeframes: this.simulator.timeframes
			});

			messenger.onmessage = handleMessage.bind(client);
			messenger.onclose = handleDisconnect.bind(client);

			if (this.onclientadded) {
				this.onclientadded(client);
			}

			return client;
		};
		p.removeClient = function(client) {
			utils.remove(this.clients, client);
			if (this.onclientremoved) {
				this.onclientremoved(client);
			}
			if (this.clients.length === 0 && this.onempty) {
				this.onempty();
			}
		};
		p.broadcast = function(msg) {
			this.clients.forEach(function(client) {
				client.messenger.send(msg);
			});
		};
		p.close = function() {
			clearTimeout(this.gameupdateTimeout);
		};
	})(NetworkServer.prototype);

	function handleMessage(msg) {
		if (msg.frame && this.server.simulator.isFramePrehistoric(msg.frame)) {
			console.log('Detected message from prehistoric frame (' + msg.frame + ') from',this.id);
			this.sendReset();
		} else {
			this.server.messageHandlers[msg.type].call(this,msg);
		}
	}

	function handleSyn(msg) {
		this.messenger.send({
			type: 'ack',
			oframe: msg.frame,
			nframe: this.server.simulator.getLastFrame()
		});
		this.lastframe = msg.frame;
	}
	function handleAck(msg) {
		this.latency = msg.latency;
	}
	function handleResetrequest(msg) {
		console.log('Got request to reset from client',this.id);
		this.sendReset();
	}
	function handleDisconnect() {
		var simulator = this.server.simulator;
		simulator.getLastTimeFrame().events.push({
			type: 'disconnect',
			clientid: this.id
		});
		this.broadcast({
			type: 'disconnect',
			clientid: this.id,
			frame: simulator.getLastTimeFrame().gamestate.frame
		});
		this.server.removeClient(this);
		console.log('disconnected');
	}

	function Client() { }
	(function(p) {
		p.broadcast = function(msg) {
			for(var k in this.server.clients) {
				var other = this.server.clients[k];
				if (other === this) { continue; }
				other.messenger.send(msg);
			}
		};
		p.sendReset = function() {
			this.messenger.send({
				type: 'reset',
				timeframes: this.server.simulator.timeframes
			});
		};
	})(Client.prototype);


	return NetworkServer;
});