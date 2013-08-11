// Simulator
// Simulates a game and holds a history of previous simulations and their inputs.
// Simulator holds a list of known history in 'this.timeframes'.
// Each timeframe holds the state of the game and the events that have occured that frame.
// A new state is calculated from the state and events of the previous timeframe.

define(['./utils'],function(utils) {
	/** @constructor */
	function Simulator(game) {
		this.futureEvents = [];
		this.timeframes = [{
			events: [],
			gamestate: game.init()
		}];
		this.game = game;
		this.maxFramesInHistory = Simulator.defaultMaxFramesInHistory;
	}

	// No maximum of frames: handle frame removal yourself.
	Simulator.defaultMaxFramesInHistory = -1;

	(function(p) {
		p.getTimeFrame = function(frame) {
			var frameIndex = this.timeframes[0].gamestate.frame - frame;
			utils.assert(frameIndex >= 0, 'The frame '+frame+' was newer than the last frame '+this.timeframes[0].gamestate.frame);
			utils.assert(frameIndex < this.timeframes.length, 'The frame '+frame+' was too old! (max '+this.timeframes.length+')');
			return this.timeframes[frameIndex];
		};
		p.recalculateGameStates = function(fromframe) {
			var now = this.timeframes[0].gamestate.frame;
			for(var frame=fromframe;frame<now;frame++) {
				var timeframe = this.getTimeFrame(frame);
				var newGameState = this.nextGameStateFromTimeFrame(timeframe);
				this.getTimeFrame(frame+1).gamestate = newGameState;
			}
		};
		p.disposeTimeFramesBefore = function(frame) {
			while (this.timeframes[this.timeframes.length-1].gamestate.frame < frame) {
				this.timeframes.pop();
			}
		};
		p.nextGameStateFromTimeFrame = function(timeframe) {
			return this.game.update(timeframe.gamestate, timeframe.events);
		};

		// Increments the game one frame.
		// The latest state and events are taken and a new timeframe is calculated using the update function from game.
		p.updateGame = function() {
			// Calculate new timeframe
			var curtimeframe = this.timeframes[0];
			var curgamestate = curtimeframe.gamestate;
			var curevents = curtimeframe.events;
			var newgamestate = this.game.update(curgamestate,curevents);
			this.timeframes.unshift({
				events: [],
				gamestate: newgamestate
			});

			// Place (previously) future events in the new timeframe if they were destined to be in that frame.
			while (this.futureEvents.length > 0 && newgamestate.frame === this.futureEvents[0].frame) {
				var futureEvent = this.futureEvents.shift();

				addSorted(this.timeframes[0].events,futureEvent.event,this.game.compareEvents);
			}

			// Only remove frames is maxFramesInHistory is enabled.
			if (this.maxFramesInHistory >= 0) {
				// Remove old timeframes
				while (this.timeframes.length > this.maxFramesInHistory) {
					var timeframe = this.timeframes.pop();
					utils.debug('!STATE:',timeframe.gamestate.frame,utils.JSONstringify(timeframe.gamestate));
					timeframe.events.forEach(function(event) {
						utils.debug('!EVENT:',timeframe.gamestate.frame,utils.JSONstringify(event));
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
			var frameIndex = this.getLastTimeFrame().gamestate.frame - frame;
			if (frameIndex < 0) { // Event in the future?
				var index = utils.findIndex(this.futureEvents, function(futureEvent) {
					return frame < futureEvent.frame;
				});
				if (index === -1) { index = this.futureEvents.length; }
				this.futureEvents.splice(index,0,{
					frame: frame,
					event: event
				});
			} else if (frameIndex < this.timeframes.length) { // Event of current frame or the memorized past?
				var timeframe = this.getTimeFrame(frame);
				addSorted(timeframe.events,event,this.game.compareEvents);
				this.recalculateGameStates(frame);
			} else {
				throw new Error('The inserted frame is prehistoric: it is too old to simulate');
			}
		};

		// Resets the whole simulator state to the specified state and set its futureEvents.
		// Use this in conjuction with fastForward to also simulate the specified events.
		p.resetState = function(state,futureEvents) {
			console.log('!RESET to state with frame',state.frame,'and',futureEvents.length,'future events');

			// Reset timeframes
			this.timeframes.length = 0;
			this.timeframes.unshift({
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
			for(var i=this.timeframes.length-1;i>=0;i--) {
				var timeframe = this.timeframes[i];
				timeframe.events.forEach(function(e) {
					events.push({
						frame: timeframe.gamestate.frame,
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
			return frame < this.timeframes[this.timeframes.length-1].gamestate.frame;
		};
		p.getCurrentGameState = function() {
			return this.timeframes[0].gamestate;
		};
		p.getCurrentFrame = function() {
			return this.timeframes[0].gamestate.frame;
		};
		p.getLastTimeFrame = function() {
			return this.timeframes[0];
		};
		p.getLastFrame = function() {
			return this.getLastTimeFrame().gamestate.frame;
		};
		p.getOldestState = function() {
			return this.timeframes[this.timeframes.length-1].gamestate;
		};
		function addSorted(arr,item,compare) {
			var i;
			for(i=0;i<arr.length && compare(item,arr[i])>0;i++) { }
			arr.splice(i,0,item);
		}
	})(Simulator.prototype);

	return Simulator;
});