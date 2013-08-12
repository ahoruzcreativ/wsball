// Simulator
// Simulates a game and holds a history of previous simulations and their inputs.
// Simulator holds a list of known history in 'this.moments'.
// Each moment holds the state of the game and the events that have occured that frame.
// A new state is calculated from the state and events of the previous moment.

define(['./utils'],function(utils) {
	/** @constructor */
	function Simulator(game) {
		this.futureEvents = [];
		this.moments = [{
			events: [],
			gamestate: game.init()
		}];
		this.game = game;
		this.maxFramesInHistory = Simulator.defaultMaxFramesInHistory;
	}

	// No maximum of frames: handle frame removal yourself.
	Simulator.defaultMaxFramesInHistory = -1;

	(function(p) {
		p.getMoment = function(frame) {
			var frameIndex = this.moments[0].gamestate.frame - frame;
			utils.assert(frameIndex >= 0, 'The frame '+frame+' was newer than the last frame '+this.moments[0].gamestate.frame);
			utils.assert(frameIndex < this.moments.length, 'The frame '+frame+' was too old! (max '+this.moments.length+')');
			return this.moments[frameIndex];
		};
		p.recalculateGameStates = function(fromframe) {
			var now = this.moments[0].gamestate.frame;
			for(var frame=fromframe;frame<now;frame++) {
				var moment = this.getMoment(frame);
				var newGameState = this.nextGameStateFromMoment(moment);
				this.getMoment(frame+1).gamestate = newGameState;
			}
		};
		p.disposeMomentsBefore = function(frame) {
			while (this.moments.length > 1 && this.moments[this.moments.length-1].gamestate.frame < frame) {
				this.moments.pop();
			}
		};
		p.nextGameStateFromMoment = function(moment) {
			return this.game.update(moment.gamestate, moment.events);
		};

		// Increments the game one frame.
		// The latest state and events are taken and a new moment is calculated using the update function from game.
		p.updateGame = function() {
			// Calculate new moment
			var curmoment = this.moments[0];
			var curgamestate = curmoment.gamestate;
			var curevents = curmoment.events;
			var newgamestate = this.game.update(curgamestate,curevents);
			this.moments.unshift({
				events: [],
				gamestate: newgamestate
			});

			// Place (previously) future events in the new moment if they were destined to be in that frame.
			while (this.futureEvents.length > 0 && newgamestate.frame === this.futureEvents[0].frame) {
				var futureEvent = this.futureEvents.shift();

				addSorted(this.moments[0].events,futureEvent.event,this.game.compareEvents);
			}

			// Only remove frames is maxFramesInHistory is enabled.
			if (this.maxFramesInHistory >= 0) {
				// Remove old moments
				while (this.moments.length > this.maxFramesInHistory) {
					var moment = this.moments.pop();
					utils.debug('!STATE:',moment.gamestate.frame,utils.JSONstringify(moment.gamestate));
					moment.events.forEach(function(event) {
						utils.debug('!EVENT:',moment.gamestate.frame,utils.JSONstringify(event));
					});
				}
			}
		};
		p.fastForward = function(frame) {
			utils.debug('!FASTFORWARD: from frame',this.getCurrentFrame(),'to frame',frame);
			while(this.getCurrentFrame() < frame) {
				this.updateGame();
			}
			utils.debug('!FASTFORWARDED: to frame',this.getCurrentFrame());
		};
		p.pushEvent = function(event) {
			this.insertEvent(this.getCurrentFrame(),event);
		};
		
		// Adds the specified event into the specified frame.
		// If frame is in the future, it will be added to futureEvents.
		// If frame is in known history it will be inserted into that frame and trailing frames will be re-simulated.
		// If frame is prehistoric an error will be thrown.
		p.insertEvent = function(frame,event) {
			utils.assert(event);
			var frameIndex = this.getLastMoment().gamestate.frame - frame;
			if (frameIndex < 0) { // Event in the future?
				var index = utils.findIndex(this.futureEvents, function(futureEvent) {
					return frame < futureEvent.frame;
				});
				if (index === -1) { index = this.futureEvents.length; }
				this.futureEvents.splice(index,0,{
					frame: frame,
					event: event
				});
			} else if (frameIndex < this.moments.length) { // Event of current frame or the memorized past?
				var moment = this.getMoment(frame);
				addSorted(moment.events,event,this.game.compareEvents);
				this.recalculateGameStates(frame);
			} else {
				throw new Error('The inserted frame is prehistoric: it is too old to simulate');
			}
		};

		// Resets the whole simulator state to the specified state and set its futureEvents.
		// Use this in conjuction with fastForward to also simulate the specified events.
		p.resetState = function(state,futureEvents) {
			console.log('!RESET to state with frame',state.frame,'and',futureEvents.length,'future events');

			// Reset moments
			this.moments.length = 0;
			this.moments.unshift({
				events: [],
				gamestate: state
			});

			// Reset futureEvents
			for(var i=0;i<futureEvents.length;i++) {
				this.insertEvent(futureEvents[i].frame, futureEvents[i].event);
			}
		};

		p.getEvents = function() {
			var events = [];
			for(var i=this.moments.length-1;i>=0;i--) {
				var moment = this.moments[i];
				moment.events.forEach(function(e) {
					events.push({
						frame: moment.gamestate.frame,
						event: e
					});
				});
			}
			this.futureEvents.forEach(function(fe) {
				events.push(fe);
			});
			return events;
		};

		// Returns whether the frame is before known history.
		p.isFramePrehistoric = function(frame) {
			return frame < this.moments[this.moments.length-1].gamestate.frame;
		};
		p.getCurrentGameState = function() {
			return this.moments[0].gamestate;
		};
		p.getCurrentFrame = function() {
			return this.moments[0].gamestate.frame;
		};
		p.getLastMoment = function() {
			return this.moments[0];
		};
		p.getLastFrame = function() {
			return this.getLastMoment().gamestate.frame;
		};
		p.getOldestState = function() {
			return this.moments[this.moments.length-1].gamestate;
		};
		function addSorted(arr,item,compare) {
			var i;
			for(i=0;i<arr.length && compare(item,arr[i])>0;i++) { }
			arr.splice(i,0,item);
		}
	})(Simulator.prototype);

	return Simulator;
});