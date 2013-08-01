var express = require('./express-ws');

var requirejs = require('requirejs');
requirejs.config({
	nodeRequire: require
});
requirejs(['./web/simulator','./web/wsball-game','./web/jsonwebsocketmessenger'],function(Simulator,game,JsonWebsocketMessenger) {
//require('sugar');
Array.prototype.contains = function(e) { return this.indexOf(e) >= 0; }
Array.prototype.remove = function(e) {
	var i = this.indexOf(e);
	this.splice(i,1);
};


var app = express();

var clients = [];
var newid = 1;
app.use(express.static('web'));

var simulator = new Simulator(game);
var timeframes = simulator.timeframes;
var getLastTimeFrame = simulator.getLastTimeFrame.bind(simulator);
var updateGame = simulator.updateGame.bind(simulator);
var insertEvent = simulator.insertEvent.bind(simulator);

function getLastFrame() { return simulator.getLastTimeFrame().gamestate.frame; }


app.ws.usepath('/client',function(req,next) {
	if (!req.requestedProtocols.contains('game')) { console.log('Rejected'); return req.reject(); }
	console.log('connected');
	var ws = req.accept('game',req.origin);
	var messenger = new JsonWebsocketMessenger(ws);
	var client = {
		id: newid++,
		messenger: messenger,
		lastframe: getLastFrame()
	};

	clients.push(client);

	(function() { // Initialize client.
		var timeframe = getLastTimeFrame();
		timeframe.events.push({
			type: 'connect',
			clientid: client.id
		});
		sendToOthers({
			type: 'connect',
			clientid: client.id,
			frame: timeframe.gamestate.frame
		});

		client.messenger.send({
			type: 'initialize',
			clientid: client.id,
			timeframe: getLastTimeFrame()
		});

		clients.forEach(function(other) {
			if (other === client) { return; }
			if (!other.name) { return; }
			client.messenger.send({
				type: 'setname',
				clientid: other.id,
				name: other.name
			});
		});
	})();

	function sendToOthers(msg) {
		clients.forEach(function(other) {
			if (other === client) { return; }
			other.messenger.send(msg);
		});
	}

	ws.on('message',function(rawmsg) {
		var msg;
		switch(rawmsg.type) {
			case 'utf8': msg = JSON.parse(rawmsg.utf8Data); break;
			case 'binary': throw "Unsupported"; break;
		}

		function sendReset() {
			console.log('RESET');
			client.messenger.send({
				type: 'reset',
				timeframes: timeframes
			});
		}

		function keyEvent(msg) {
			function insert() {
				insertEvent(msg.frame,{
					type: msg.type,
					clientid: client.id,
					key: msg.key
				});
			}
			if (msg.frame < timeframes[timeframes.length-1].gamestate.frame) {
				msg.frame = timeframes[timeframes.length-1].gamestate.frame;
				insert();
				sendReset();
			} else {
				insert();
			}
			msg.clientid = client.id;
			sendToOthers(msg);
		}
		({
			down: keyEvent,
			up: keyEvent,
			syn: function(msg) {
				client.messenger.send({
					type: 'ack',
					oframe: msg.frame,
					nframe: getLastFrame()
				});
				client.lastframe = msg.frame;
			},
			ack: function(msg) {
				client.latency = msg.latency;
			},
			setname: function(msg) {
				if (/^[a-zA-Z0-9_\-\.]{1,5}$/.test(msg.name)) {
					client.name = msg.name;
					sendToOthers({
						type: msg.type,
						clientid: client.id,
						name: msg.name
					});
				} else {
					client.messenger.send({
						type:'setname',
						clientid:client.id,
						name:client.name
					});
				}
			},
			resetrequest: function(msg) {
				sendReset();
			}
		}[msg.type])(msg);
	});
	ws.on('error',function() {
		console.error('websocket error',arguments);
	});
	ws.on('close',function() {
		getLastTimeFrame().events.push({
			type: 'disconnect',
			clientid: client.id
		});
		sendToOthers({
			type: 'disconnect',
			clientid: client.id,
			frame: getLastTimeFrame().gamestate.frame
		});
		clients.remove(client);
		console.log('disconnected');
	});
});


app.listen(8085);

function update() {
	var tf = getLastTimeFrame();
	process.stdout.write('\r' + [
		'@'+tf.gamestate.frame,
		'!'+simulator.futureEvents.length,
		'|'+timeframes.length,
		':'+tf.gamestate.players.length,
		'*'+tf.events.length,
		tf.gamestate.players.map(function(player) {
			return '('+Math.round(player.x)+','+Math.round(player.y)+')';
		}).join(' ')
		].join(' '));
	updateGame();

	// Trim timeframes that will never be used (the oldest timeframe in use by clients)
	var minimalframe = clients.reduce(function(prev,client) {
		return client.lastframe < prev ? client.lastframe : prev;
	},getLastFrame());
	while (timeframes.length > 0 && timeframes[timeframes.length-1].gamestate.frame < minimalframe) {
		timeframes.pop();
	}
	/*var curframe = getLastTimeFrame().gamestate.frame;
	clients.forEach(function(client) {
		if (curframe - client.lastsyn < 30) { return; }
		client.lastsyn = curframe;
		client.messenger.send({
			type: 'syn',
			frame: curframe
		});
	});*/
}

setInterval(update,1000*(1/30));


process.on('uncaughtException', function (err) {
	console.dir(err);
	throw err;
});

});