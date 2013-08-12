define(['./utils','./vector','./linesegment'],function(utils,Vector,LineSegment) {
	var constants = {
		ball_radius: 10,
		ball_mass: 5,
		ball_bounciness: 0.5,

		player_mass: 10,
		player_radius: 20,
		player_bounciness: 0
	};

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
		ballcollision: createBox([
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
		playercollision: createBox([
			new Vector(0,0),

			new Vector(0,235),
			new Vector(50,235),
			new Vector(50,240),
			new Vector(10,240),
			new Vector(10,360),
			new Vector(50,360),
			new Vector(50,365),
			new Vector(0,365),

			new Vector(0,600),
			new Vector(800,600),

			new Vector(800,365),
			new Vector(750,365),
			new Vector(750,360),
			new Vector(790,360),
			new Vector(790,240),
			new Vector(750,240),
			new Vector(750,235),
			new Vector(800,235),

			new Vector(800,0)
		]),
		teams: [
			{ goals: [new LineSegment(40,240, 40,360)],
			  color: '#ff2d2d'
			},
			{ goals: [new LineSegment(760,360, 760,240)],
			  color: '#376fff'
			}
		]
	};
	var fieldpositions = [300,350,250,400,200];
	function getPlayerIndex(state,player) {
		var index = 0;
		var players = state.players;
		for(var i=0;i<players.length;i++) {
			var p = players[i];
			if (p === player) { return index; }
			if (p.team === player.team) { index++; }
		}
	}
	function positionPlayer(state,player) {
		var nr = getPlayerIndex(state,player);
		player.x = 400 + 200*(player.team === 0 ? -1 : 1) + Math.floor(nr/fieldpositions.length)*50;
		player.y = fieldpositions[nr%5];
	}
	function reset(state) {
		var gs = state;
		gs.players.forEach(function(player) {
			positionPlayer(gs,player);
			player.vx = 0;
			player.vy = 0;
		});
		gs.ball.x = 400;
		gs.ball.y = 300;
		gs.ball.vx = 0;
		gs.ball.vy = 0;
	}
	function initGame() {
		return {
			frame: 0,
			scores: [0,0],
			players: [],
			ball: {x:400,y:300,vx:0,vy:0}
		};
	}
	function updateGame(state,events) {
		var t = new Vector();
		var t2 = new Vector();


		var og = state;
		var playerLookup = {};

		utils.assert(og.scores);

		// Create new state from old state.
		var ng = {
			frame: og.frame+1,

			scores: og.scores.slice(0),

			players: og.players.map(function(player) {
				return playerLookup[player.clientid] = {
					clientid: player.clientid,
					keys: cloneObject(player.keys),
					team: player.team,
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
					var balance = ng.players.reduce(function(last,curr) { return last + (curr.team === 0 ? 1 : -1); },0);
					var newplayer = {
						team: balance > 0 ? 1 : 0,
						x: 400, y: 300,
						vx: 0, vy: 0,
						keys: {},
						clientid: event.clientid
					};
					ng.players.push(newplayer);
					positionPlayer(ng,newplayer);
				},
				disconnect: function(ng,event) {
					var player = playerLookup[event.clientid];
					utils.remove(ng.players, player);
				}
			}[event.type])(ng,event);
		});

		for(var i=0;i<level.teams.length;i++) {
			var team = level.teams[i];
			var collisions = [];
			getCollisions(ng.ball,constants.ball_radius,team.goals,collisions);
			if (collisions.length > 0) {
				for(var si=0;si<ng.scores.length;si++) {
					if (si !== i) { ng.scores[si]++; }
				}
				reset(ng);
			}
		}

		// Handle gameplay on new state.
		ng.ball.x += ng.ball.vx;
		ng.ball.y += ng.ball.vy;
		ng.ball.vx *= 0.95;
		ng.ball.vy *= 0.95;

		ng.players.forEach(function(player) {
			function n(b){return b?1:0;}
			var dirx = n(player.keys.right) - n(player.keys.left);
			var diry = n(player.keys.down) - n(player.keys.up);
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
				var totalmass = massa+massb;
				t.normalizeOrZero();

				// Reposition
				var penetrationLength = radiusa+radiusb-l;
				pa.x += penetrationLength*t.x*(massb/totalmass);
				pa.y += penetrationLength*t.y*(massb/totalmass);

				pb.x -= penetrationLength*t.x*(massa/totalmass);
				pb.y -= penetrationLength*t.y*(massa/totalmass);

				// Bounce
				var d = t.dot(pa.vx-pb.vx,pa.vy-pb.vy);
				if (d < 0) {
					t.multiply(d * (1 + bounciness));
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
			handleLineCollision(p,constants.player_radius,constants.player_bounciness, level.playercollision);
		});
		handleLineCollision(ng.ball,constants.ball_radius,constants.ball_bounciness, level.ballcollision);

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

	var eventTypePriority = {
		'connect': 1,
		'up': 2,
		'down': 3,
		'disconnect': 5
	};
	function compare(va,vb) {
		if (va === undefined) {
			if (vb === undefined) { return 0; }
			return 1;
		} else if (vb === undefined) {
			return -1;
		}
		return (va > vb) ? 1 : (vb > va ? -1 : 0);
	}
	function compareEvents(ea,eb) {
		utils.assert(eventTypePriority[ea.type]);
		utils.assert(eventTypePriority[eb.type]);
		return compare(eventTypePriority[ea.type],eventTypePriority[eb.type]) || compare(ea.clientid,eb.clientid) || compare(ea.key,eb.key) || compare(ea.name,eb.name);
	}

	return {
		init: initGame,
		update: updateGame,
		level: level,
		constants: constants,
		compareEvents: compareEvents
	};
});