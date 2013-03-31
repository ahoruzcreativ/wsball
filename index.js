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

		function keyEvent(msg) {
			var lastFrame = getLastFrame();
			var insertFrame = Math.min(msg.frame,lastFrame);
			insertEvent(insertFrame,{
				type: msg.type,
				clientid: client.id,
				key: msg.key
			});
			if (msg.frame > getLastFrame()) {
				// The client was too fast somehow.
				client.send({
					type: 'reset',
					timeframe: getLastTimeFrame()
				});
			}

			msg.frame = insertFrame;
			msg.clientid = client.id;
			sendToOthers(msg);
		}
		({
			down: keyEvent,
			up: keyEvent
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
			return '('+player.x+','+player.y+')';
		}).join(' ')
		].join(' '));
	updateGame();
}

setInterval(update,1000*(1/30));

process.on('uncaughtException', function(err) {
  console.log(err.stack);
  throw err;
});