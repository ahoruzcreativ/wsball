try {
	module.exports = newGame;
} catch(e) { }

function newGame() {

	function assert(b) { if(!b) {
		debugger;
		throw 'Assertion failed';
	} }
	function cloneArray(arr) {
		var r = [];
		for(var i=0;i<arr.length;i++) {
			r.push(arr[i]);
		}
		return r;
	}
	function cloneObject(obj) {
		var r = {};
		var keys = Object.keys(obj);
		for(var i=0;i<keys.length;i++) {
			r[keys[i]] = obj[keys[i]];
		}
		return r;
	}

	var futureEvents = [];
	var timeframes = [{
		events: [],
		gamestate: {
			frame: 0,
			players: [],
			ball: {x:0,y:0,vx:0,vy:0}
		}
	}];

	function getLastTimeFrame() {
		return timeframes[0];
	}

	function getTimeFrame(frame) {
		var frameIndex = timeframes[0].gamestate.frame - frame;
		assert(frameIndex >= 0, 'The frame '+frame+' was newer than the last frame '+timeframes[0].gamestate.frame);
		assert(frameIndex < timeframes.length, 'The frame '+frame+' was too old! (max '+timeframes.length+')');
		return timeframes[frameIndex];
	}

	function recalculateGameStates(fromframe) {
		var now = timeframes[0].gamestate.frame;
		for(var frame = fromframe;frame<now;frame++) {
			var timeframe = getTimeFrame(frame);
			var newGameState = nextGameStateFromTimeFrame(timeframe);
			getTimeFrame(frame+1).gamestate = newGameState;
		}
	}

	function nextGameStateFromTimeFrame(timeframe) {
		return nextGameState(timeframe.gamestate, timeframe.events);
	}

	function nextGameState(gamestate,events) {
		var og = gamestate;
		var playerLookup = {};

		// Create new gamestate.
		var ng = {
			frame: og.frame+1,

			players: og.players.map(function(player) {
				return playerLookup[player.clientid] = {
					clientid: player.clientid,
					keys: cloneObject(player.keys),
					x: player.x,
					y: player.y,
					vx: player.vx,
					vy: player.vy
				};
			}),

			ball: {
				x: og.ball.x,
				y: og.ball.y,
				vx: og.ball.vx,
				vy: og.ball.vy
			}
		};

		// Handle events.
		events.forEach(function(event) {
			({
				down: function(ng,event) {
					var player = playerLookup[event.clientid];
					player.keys[event.key] = 1;
				},
				up: function(ng,event) {
					var player = playerLookup[event.clientid];
					delete player.keys[event.key];
				},
				connect: function(ng,event) {
					ng.players.push({
						x: 500, y: 500,
						vx: 0, vy: 0,
						keys: {},
						clientid: event.clientid
					});
				},
				disconnect: function(ng,event) {
					var player = playerLookup[event.clientid];
					ng.players.remove(player);
				}
			}[event.type])(ng,event);
		});

		// Handle gameplay on new gamestate.
		ng.ball.x += ng.ball.vx;
		ng.ball.y += ng.ball.vy;

		ng.players.forEach(function(player) {
			function n(b){return b?1:0;}
			player.vx += n(player.keys.right) - n(player.keys.left);
			player.vy += n(player.keys.up) - n(player.keys.down);
			player.x += player.vx;
			player.y += player.vy;
			player.vx *= 0.99;
			player.vy *= 0.99;
		});

		return ng;
	}

	function updateGame() {
		// Calculate new timeframe
		var curtimeframe = timeframes[0];
		var curgamestate = curtimeframe.gamestate;
		var curevents = curtimeframe.events;
		var newgamestate = nextGameState(curgamestate,curevents);
		timeframes.unshift({
			events: [],
			gamestate: newgamestate
		});

		// Place (previously) future events in the new timeframe if they were destined to be in that frame.
		while (futureEvents.length > 0 && newgamestate.frame === futureEvents[0].frame) {
			var futureEvent = futureEvents.shift();
			timeframes[0].events.push(futureEvent.event);
		}

		// Remove old timeframes
		while (timeframes.length > 300) {
			timeframes.pop();
		}
	}

	function insertEvent(frame,event) {
		if (frame > getLastTimeFrame().gamestate.frame) { // Event in the future?
			var index = futureEvents.findIndex(function(futureEvent) {
				return frame < futureEvent.frame;
			});
			if (index === -1) { index = futureEvents.length; }
			futureEvents.splice(index,0,{
				frame: frame,
				event: event
			});
		} else { // Event of current frame or the past?
			var timeframe = getTimeFrame(frame);
			timeframe.events.push(event);
			recalculateGameStates(frame);
		}
	}
	function resetTimeFrame(timeframe) {
		var newframe = timeframe.gamestate.frame;
		var lastframe = getLastTimeFrame().gamestate.frame;
		assert(newframe < lastframe);
		var newindex = lastframe - newframe;
		timeframes.splice(0,newindex+1,timeframe);
		assert(timeframes[0].gamestate.frame === (timeframes[1].gamestate.frame+1));
	}

	return {
		timeframes: timeframes,
		futureEvents: futureEvents,
		getLastTimeFrame: getLastTimeFrame,
		updateGame: updateGame,
		insertEvent: insertEvent,
		resetTimeFrame: resetTimeFrame
	};
}