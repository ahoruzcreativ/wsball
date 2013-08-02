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
	function assert(b) { if(!b) {
		debugger;
		throw new Error('Assertion failed');
	} }

	return {
		findIndex: findIndex,
		contains: contains,
		remove: remove,
		extend: extend,
		assert: assert
	};
});