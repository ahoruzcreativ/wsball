define(['./vector','./linesegment'],function(Vector,LineSegment) {
	var constants = {
		ball_radius: 10,
		ball_mass: 5,
		ball_bounciness: 0.5,

		player_mass: 10,
		player_radius: 20,
		player_bounciness: 0
	};
	return function newGame() {
	function assert(b) { if(!b) {
		debugger;
		throw new Error('Assertion failed');
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
	function findIndex(arr,f) {
		for(var i=0;i<arr.length;i++) {
			if (f(arr[i],i)) { return i; }
		}
		return -1;
	}

	var futureEvents = [];
	var timeframes = [{
		events: [],
		gamestate: {
			frame: 0,
			scores: [0,0],
			players: [],
			ball: {x:300,y:300,vx:0,vy:0}
		}
	}];


	function createBox(points) {
		var lineSegments = [];
		var prevPoint = points[points.length-1];
		points.forEach(function(point) {
			lineSegments.push(new LineSegment(prevPoint.x, prevPoint.y, point.x, point.y));
			prevPoint = point;
		});
		return lineSegments;
	}
	var level = {
		lines: createBox([
			new Vector(50,50),
			
			new Vector(50,240),
			new Vector(10,240),
			new Vector(10,360),
			new Vector(50,360),

			new Vector(50,550),
			new Vector(750,550),

			new Vector(750,360),
			new Vector(790,360),
			new Vector(790,240),
			new Vector(750,240),
			
			new Vector(750,50)
		]),
		teams: [
			{ goals: [new LineSegment(40,240, 40,360)] },
			{ goals: [new LineSegment(760,360, 760,240)] }
		]
	};

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

	function reset(gamestate) {
		var gs = gamestate;
		gs.players.forEach(function(player) {
			player.x = 400;
			player.y = 300;
			player.vx = 0;
			player.vy = 0;
		});
		gs.ball.x = 400;
		gs.ball.y = 300;
		gs.ball.vx = 0;
		gs.ball.vy = 0;
	}

	function nextGameState(gamestate,events) {
		var t = new Vector();
		var t2 = new Vector();


		var og = gamestate;
		var playerLookup = {};

		assert(og.scores);

		// Create new gamestate from old gamestate.
		var ng = {
			frame: og.frame+1,

			scores: og.scores.splice(0),

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

		for(var i=0;i<level.teams.length;i++) {
			var team = level.teams[i];
			var collisions = [];
			getCollisions(ng.ball,constants.ball_radius,team.goals,collisions);
			if (collisions.length > 0) {
				ng.scores[i]++;
				reset(ng);
			}
		}

		// Handle gameplay on new gamestate.
		ng.ball.x += ng.ball.vx;
		ng.ball.y += ng.ball.vy;
		ng.ball.vx *= 0.95;
		ng.ball.vy *= 0.95;

		ng.players.forEach(function(player) {
			function n(b){return b?1:0;}
			var dirx = n(player.keys.right) - n(player.keys.left);
			var diry = n(player.keys.up) - n(player.keys.down);
			var len = Math.sqrt(dirx*dirx+diry*diry);
			if (len > 0) {
				dirx /= len;
				diry /= len;
			}
			player.x += player.vx;
			player.y += player.vy;
			player.vx *= 0.6;
			player.vy *= 0.6;
			var speed = 3;
			player.vx += dirx * speed;
			player.vy += diry * speed;
		});

		var radius = 20.0;
		var bounciness = 0;
		var mass = 1;

		// Handle player - player and player - ball collision
		ng.players.forEach(function(pa) {
			ng.players.forEach(function(pb) {
				if (pa === pb) { return; }
				handleCircleCollision(
					pa,constants.player_mass,constants.player_radius,
					pb,constants.player_mass,constants.player_radius
				);
			});
			if (handleCircleCollision(
					ng.ball,constants.ball_mass,constants.ball_radius,
					pa,constants.player_mass,constants.player_radius
				) && pa.keys['x']) {
				t.set(ng.ball.x,ng.ball.y);
				t.substract(pa.x,pa.y);
				t.normalizeOrZero();
				var pspeed = t.dot(pa.vx,pa.vy);
				t.multiply(pspeed + 10);
				ng.ball.vx = t.x;
				ng.ball.vy = t.y;

				delete pa.keys['x'];
			}
		});
		function handleCircleCollision(pa,massa,radiusa,pb,massb,radiusb) {
			t.set(pa.x,pa.y);
			t.substract(pb.x,pb.y);
			var l = t.length();
			if (l < radiusa+radiusb) {
				t.normalizeOrZero();
				var d = t.dot(pa.vx-pb.vx,pa.vy-pb.vy);
				if (d < 0) {
					t.multiply(d * (1 + bounciness));
					var totalmass = massa+massb;
					pa.vx -= t.x*(massb/totalmass);
					pa.vy -= t.y*(massb/totalmass);

					pb.vx += t.x*(massa/totalmass);
					pb.vy += t.y*(massa/totalmass);
					return true;
				}
			}
			return false;
		}

		ng.players.forEach(function(p) {
			handleLineCollision(p,constants.player_radius,constants.player_bounciness, level.lines);
		});
		handleLineCollision(ng.ball,constants.ball_radius,constants.ball_bounciness, level.lines);

		function getCollisions(o,radius, lineSegments, collisions) {
			for(var i=0;i<lineSegments.length;i++) {
				var lineSegment = lineSegments[i];
				if (lineSegment.normal.dot(o.vx,o.vy) > 0) {
					continue;
				}
				t.setV(lineSegment.normal);
				t.normalRight();
				var l = lineSegment.start.distanceToV(lineSegment.end);
				t2.set(o.x,o.y);
				t2.substractV(lineSegment.start);
				var offY = lineSegment.normal.dotV(t2)-radius;
				var offX = t.dotV(t2);
				if (offY < -radius*2) {
					continue;
				} else if (offY < 0) {
					var d;
					if (offX > 0 && offX < l) {
						offY*=-1;
						collisions.push({
							lineSegment: lineSegment,
							offset:offY
						});
					} else if (offX < 0 && offX > -radius) {
						d = lineSegment.start.distanceTo(o.x,o.y);
						if (d < radius) {
							t.set(o.x,o.y);
							t.substractV(lineSegment.start);
							t.normalize();
							collisions.push({
								lineSegment: lineSegment,
								offset:radius-d
							});
						}
					} else if (offX > l && offX < l+radius) {
						d = lineSegment.end.distanceTo(o.x,o.y);
						if (d < radius) {
							t.set(o.x,o.y);
							t.substractV(lineSegment.end);
							t.normalize();
							collisions.push({
								lineSegment: lineSegment,
								offset:radius-d
							});
						}
					}
				} else {
					continue;
				}
			}
		}

		function handleLineCollision(o,radius,bounciness, collisionlines) {
 			for(var iteration=0;iteration<5;iteration++) {
				var collisions = [];
				
				getCollisions(o,radius,collisionlines,collisions);
				if (collisions.length > 0) {
					collisions.sort(function(a,b) {
						return b.offset-a.offset;
					});
					var c = collisions[0];
					//offset-=1;
					t.set(o.x,o.y);
					t.add(c.lineSegment.normal.x*c.offset,c.lineSegment.normal.y*c.offset);
					o.x = t.x; o.y = t.y;
					var vc = c.lineSegment.normal.dot(o.vx,o.vy);

					t.set(o.vx,o.vy);
					t.substract((1+bounciness)*c.lineSegment.normal.x*vc, (1+bounciness)*c.lineSegment.normal.y*vc);
					o.vx = t.x; o.vy = t.y;
				} else {
					break;
				}
			}
		}

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
		while (timeframes.length > 15) {
			timeframes.pop();
		}
	}

	function insertEvent(frame,event) {
		var frameIndex = getLastTimeFrame().gamestate.frame - frame;
		if (frameIndex < 0) { // Event in the future?
			var index = findIndex(futureEvents, function(futureEvent) {
				return frame < futureEvent.frame;
			});
			if (index === -1) { index = futureEvents.length; }
			futureEvents.splice(index,0,{
				frame: frame,
				event: event
			});
		} else if (frameIndex < timeframes.length) { // Event of current frame or the past?
			var timeframe = getTimeFrame(frame);
			timeframe.events.push(event);
			recalculateGameStates(frame);
		} else {
			throw new Error('The inserted frame is prehistoric: it is too old to simulate');
		}
	}
	function resetToTimeFrames(newTimeframes) {
		timeframes.length = 0;
		Array.prototype.push.apply(timeframes,newTimeframes);
		assert(timeframes[0].gamestate.frame === (timeframes[1].gamestate.frame+1));
	}

	return {
		timeframes: timeframes,
		futureEvents: futureEvents,
		getLastTimeFrame: getLastTimeFrame,
		updateGame: updateGame,
		insertEvent: insertEvent,
		resetToTimeFrames: resetToTimeFrames,
		getLevel: function() { return level; },
		isFramePrehistoric: function(frame) { return frame < timeframes[timeframes.length-1].gamestate.frame; },
		getCurrentGameState: function() { return timeframes[0].gamestate; },
		getCurrentFrame: function() { return timeframes[0].gamestate.frame; }
	};

	}
});