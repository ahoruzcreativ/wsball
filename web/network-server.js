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
				timeframe: this.simulator.getLastTimeFrame()
			});

			messenger.onmessage = handleMessage.bind(client);
			messenger.onclose = handleDisconnect.bind(client);

			return client;
		};
		p.removeClient = function(client) {
			utils.remove(this.clients, client);
		};
		p.broadcast = function(msg) {
			this.clients.forEach(function(client) {
				client.messenger.send(msg);
			});
		};
	})(NetworkServer.prototype);

	function handleMessage(msg) {
		if (msg.frame && this.server.simulator.isFramePrehistoric(msg.frame)) {
			console.log('RESET',this.id);
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
		utils.remove(this.server.clients, this);
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