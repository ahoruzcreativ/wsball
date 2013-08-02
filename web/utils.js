define([],function() {
	function findIndex(xs,f) {
		for(var i=0;i<xs.length;i++) {
			if (f(xs[i],i)) { return i; }
		}
		return -1;
	}
	function contains(xs,x) { return xs.indexOf(x) >= 0; }
	function remove(xs,x) {
		var i = xs.indexOf(x);
		xs.splice(i,1);
	}
	function extend(a,b) {
		for(var n in b) { a[n] = b[n]; }
	}
	function assert(b) {
		if(!b) {
			debugger;
			throw new Error('Assertion failed');
		}
	}
	function hashCode(str) {
		var hash = 0, i, c;
		if (this.length == 0) return hash;
		for (i = 0, l = this.length; i < l; i++) {
			c = this.charCodeAt(i);
			hash = ((hash<<5)-hash)+c;
			hash |= 0; // Convert to 32bit integer
		}
		return hash;
	}

	return {
		findIndex: findIndex,
		contains: contains,
		remove: remove,
		extend: extend,
		assert: assert,
		hashCode: hashCode
	};
});