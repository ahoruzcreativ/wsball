var express = require('./express-ws');
var wsball_game = require('./web/wsball-game');
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

var game = wsball_game();
var timeframes = game.timeframes;
var getLastTimeFrame = game.getLastTimeFrame;
var updateGame = game.updateGame;
var insertEvent = game.insertEvent;

function getLastFrame() { return timeframes[0].gamestate.frame; }


app.ws.usepath('/client',function(req,next) {
	if (!req.requestedProtocols.contains('game')) { console.log('Rejected'); return req.reject(); }
	console.log('connected');
	var ws = req.accept('game',req.origin);
	var client = {
		id: newid++,
		ws: ws,
		lastframe: getLastFrame(),
		send: function(msg) {
			if (this.ws.connected) {
				this.ws.send(JSON.stringify(msg));
			}
		}
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

		client.send({
			type: 'initialize',
			clientid: client.id,
			timeframe: getLastTimeFrame()
		});
	})();

	function sendToOthers(msg) {
		clients.forEach(function(other) {
			if (other === client) { return; }
			other.send(msg);
		});
	}

	ws.on('message',function(rawmsg) {
		var msg;
		switch(rawmsg.type) {
			case 'utf8': msg = JSON.parse(rawmsg.utf8Data); break;
			case 'binary': throw "Unsupported"; break;
		}

		function sendReset() {
			client.send({
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
				client.send({
					type: 'ack',
					oframe: msg.frame,
					nframe: getLastFrame()
				});
				client.lastframe = msg.frame;
			},
			ack: function(msg) {
				client.latency = msg.latency;
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
		'!'+game.futureEvents.length,
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
		client.send({
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