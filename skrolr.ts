/* skrolr v1.0.0
 * GNU GPL v3
 * Jacob H. Pratt
 * jhprattdev@gmail.com
 */

// TODO case when there are no children

class skrolr {
	// all skrolrs, for iterating through
	private static all: skrolr[] = [];
	
	// run specified function on all skrolr objects
	public static each( fn: any ): void {
		for( let obj of skrolr.all )
			fn(obj);
	}
	
	// convert HTMLCollection to Array (ES3 polyfill for Array.from)
	private static _Array = class extends Array {
		public static from( obj: any ) {
			let arr = [];
			for( let i=0, len=obj.length; i<len; i++ ) {
				arr[i] = obj[i];
			}
			return arr;
		}
	}
	
	// initialize variables for later
	private readonly parent: HTMLElement;   // generated <div> containing root element
	private readonly root: HTMLElement;     // original object passed as parameter
	private numObjs: number;                // number of objects, excluding duplicates, arrows, and buttons
	private curPos: number = 0;             // current position of skrolr, 0 to len-1
	private interval: number;               // setInterval object (auto-generated)
	private inTransition: boolean = false;  // is currently transitioning
	public numWide: number[][];             // number of objects displayed // array of [min, max, size]
	public moveTime: number;                // time to move (ms)
	public waitTime: number;                // time between moving (ms)
	public transitionTiming: string;        // ease-in-out, linear, etc.
	public scrollBy: number;                // amount to scroll by each iteration
	public wasRunning: boolean = true;     // if was running before blur / out of viewport
	public isRunning: boolean = false;      // is currently running
	
	// force positive modulus
	private static pmod( x:number, n:number ): number { return ((x%n)+n)%n; }
	
	public constructor( root: HTMLElement|string, params: {[key:string]: any} ) {
		skrolr.all.push( this );
		
		// allow passing <HTMLElement> or <string>id as generator
		switch( typeof root ) {
			case "object":
				this.root = <HTMLElement>root;
				break;
			case "string":
				this.root = document.getElementById( <string>root );
				break;
			default:
				console.log( "Error: parameter passed must be DOM object or ID of a DOM object" );
				return;
		}
		this.root.className = "sk";
		
		// mandatory parameters
		this.numWide = params.numWide;

		// optional parameters
		this.moveTime = params.moveTime || 500;
		this.waitTime = params.waitTime || 3000;
		this.transitionTiming = params.transitionTiming || "ease-in-out";
		this.scrollBy = params.scrollBy || 1;
		
		// auto-generated variables
		this.numObjs = this.root.children.length; // for determining if left/right is faster
		
		// create parent element
		this.parent = document.createElement( "div" );
		this.parent.style.position = "relative";
		this.parent.style.overflow = "hidden";
		
		// set size of parent element
		if( params.height !== undefined ) {
			this.parent.style.height = params.height;
		}
		if( params.width !== undefined ) {
			this.parent.style.width = params.width;
		}
		if( params.size !== undefined ) {
			let size = params.size.split(" ");
			this.parent.style.width = size[0];
			this.parent.style.height = size[1];
		}
		
		this.root.parentElement.insertBefore( this.parent, this.root );
		this.parent.appendChild( this.root );
		this.autoWidth() // set width of all children
		// end create parent
		
		if( params.arrows === true ) { // create arrows, hidden
			const that = this;
			
			let leftArrow: HTMLElement = document.createElement( "div" );
			leftArrow.className = "sk-arrow sk-left sk-hidden";
			leftArrow.onclick = function() { that.stop().backward(); }
			this.parent.appendChild( leftArrow );
			
			let rightArrow: HTMLElement = document.createElement( "div" );
			rightArrow.className = "sk-arrow sk-right sk-hidden";
			rightArrow.onclick = function() { that.stop().forward(); }
			this.parent.appendChild( rightArrow );
			
			// show/hide on mouseover/out
			this.parent.addEventListener( "mouseover", function() { that.toggleArrows(); } );
			this.parent.addEventListener( "mouseout", function() { that.toggleArrows(); } );
		}
		
		if( params.buttons === true ) { // create buttons, hidden
			let buttons: HTMLElement = document.createElement( "div" );
			buttons.className = "sk-button-cont sk-hidden";
			this.parent.appendChild( buttons );
			
			// show/hide on mouseover/out
			const that = this;
			this.parent.addEventListener( "mouseover", function() { that.toggleButtons(); } );
			this.parent.addEventListener( "mouseout", function() { that.toggleButtons(); } );
			
			// create individual buttons
			for( let i=0; i<this.numObjs; i++ ) {
				let btn = document.createElement( "div" ); // buttons inside container
				btn.className = "sk-button";
				btn.onclick = function() { that.goto(i); };
				buttons.appendChild( btn );
			}
		}
		
		if( document.hasFocus() )
			this.start();
	}
	
	public toggleArrows(): skrolr {
		this.parent.children[1].classList.toggle( "sk-hidden" );
		this.parent.children[2].classList.toggle( "sk-hidden" );
		return this;
	}
	public toggleButtons(): skrolr {
		this.parent.children[3].classList.toggle( "sk-hidden" );
		return this;
	}
	public autoWidth(): skrolr { // set all children to correct size (in pct)
		const that = this;
		const children = this.root.children;
		for( let i=0, leni=this.numWide.length; i<leni; i++ ) {
			if( this.numWide[i][0] <= this.root.offsetWidth // if is match OR no value specified (max size)
				&& (this.root.offsetWidth < this.numWide[i][1]
				||  this.numWide[i][1] === undefined
				||  this.numWide[i][1] === null
				   ) ) { // match
				
				// using children.length instead of numObjs because of possible duplication
				for( let j=0, lenj=children.length; j<lenj; j++ ) // set all children
					(<HTMLElement>children[j]).style.width = 100 / that.numWide[i][2] + "%";
				
				// duplicate children if necessary to cover width
				while( this.childrenWidth() < this.parent.offsetWidth ) {
					for( let j=0, len=children.length; j<len; j++ ) {
						let copy = children[j].cloneNode( true );
						this.root.appendChild( copy );
					}
				}
				
				break;
			}
		}
		return this;
	}
	private childrenWidth(): number { // get total width of all children of an object
		const children = this.root.children;
		let totalWidth: number = 0;
		
		for( let i=0, len=children.length; i<len; i++ )
			totalWidth += (<HTMLElement>children[i]).offsetWidth;
		return totalWidth;
	}
	
	public forward(): skrolr {
		return this.goto( this.curPos + this.scrollBy, true );
	}
	public backward(): skrolr {
		return this.goto( this.curPos - this.scrollBy, true );
	}
	
	public goto(loc: number, noStop?: boolean): skrolr {
		if( this.inTransition ) // do nothing if in transition (disallows clicking)
			return;
		
		// stop if running
		if( noStop !== true )
			clearInterval( this.interval );
		
		loc = skrolr.pmod(loc, this.numObjs);
		
		let distToLeft: number = skrolr.pmod( this.curPos-loc, this.numObjs );
		let distToRight: number = skrolr.pmod( loc-this.curPos, this.numObjs );
		
		if( !distToLeft || !distToRight ) // already at location
			return;
		this.inTransition = true; // prevent moving again before current is complete
		if( distToRight <= distToLeft ) { // move left/forward
			this.curPos = loc;
			
			// copy n elements from beginning to end
			const children = skrolr._Array.from( <HTMLCollection>this.root.children ).slice( 0, distToRight );
			let sumWidth: number = 0;
			for( let child of children ) {
				const obj = <HTMLElement>child;
				sumWidth += obj.offsetWidth;
				const copy = obj.cloneNode( true );
				this.root.appendChild( copy );
			}
			
			// move
			this.root.style.transition = this.moveTime + 'ms ' + this.transitionTiming;
			this.root.style.left = -1 * sumWidth + 'px';
			
			// remove n elements from beginning
			const that = this;
			setTimeout( function() {
				that.root.style.transition = '0s';
				that.root.style.left = '0';
				for( let child of children )
					that.root.removeChild( child );
			}, this.moveTime );
		}
		else { // move right/backward
			this.curPos = loc;
			
			const that = this;
			// copy n elements from end to beginning
			const children = skrolr._Array.from( this.root.children ).slice( -distToLeft );
			let sumWidth: number = 0;
			let len = children.length; // to go in reverse order
			
			for( let i=0; i<len; i++ ) {
				const obj = <HTMLElement>children[len-i-1]; // -1 because len is 1-index, not 0-index
				sumWidth += obj.offsetWidth;
				const copy = obj.cloneNode( true );
				this.root.insertBefore( copy, that.root.firstChild );
			}
			
			// move
			this.root.style.transition = "0s";
			this.root.style.left = -1 * sumWidth + 'px';
			
			// const that already declared
			setTimeout( function() { // force queue in correct order
				that.root.style.transition = that.moveTime + 'ms ' + that.transitionTiming;
				that.root.style.left = '0';
			}, 0);
			setTimeout( function() {
				// remove n elements from end
				for( let child of children )
					that.root.removeChild( child );
			}, this.moveTime );
		}
		const that = this;
		setTimeout( function() {
			that.inTransition = false; // done transitioning, allow another action
		}, this.moveTime );
		return this;
	}
	
	public start(): skrolr {
		this.wasRunning = true;
		this.isRunning = true;
		
		const that = this;
		clearInterval( this.interval ); // don't allow multiple intervals
		this.interval = setInterval( function() {
			that.forward();
		}, this.moveTime + this.waitTime );
		return this;
	}
	public stop( noSet?: boolean ): skrolr {
		if( !noSet ) // only set wasRunning if noSet is excluded
			this.wasRunning = false;
		this.isRunning = false;
		clearInterval( this.interval );
		return this;
	}
	
	public isVisible(): boolean {
		const bounding = this.parent.getBoundingClientRect();
		const html = document.documentElement;
		return (
			bounding.bottom >= 0 &&                                         // not above viewport
			bounding.top <= (window.innerHeight || html.clientHeight) &&    // not below viewport
			bounding.right >= 0 &&                                          // not left of viewport
			bounding.left <= (window.innerWidth || html.clientWidth)        // not right of viewport
		);
	}
}

// resize all child elements on window resize
window.onresize = function() {
	skrolr.each( function( obj: skrolr ) {
		obj.autoWidth();
	});
};

// resume running on window focus
window.addEventListener( "focus", function() {
	skrolr.each( function( obj: skrolr ) {
		if( obj.wasRunning )
			obj.start();
	});
});

// stop running on window blur
window.addEventListener( "blur", function() {
	skrolr.each( function( obj: skrolr ) {
		obj.stop( true ); // true prevents wasRunning from being set
	});
});

// start/stop if in viewport/not
window.addEventListener( "scroll", function() {
	skrolr.each( function( obj: skrolr ) {
		const visible = obj.isVisible();
		if( !obj.isRunning && obj.wasRunning && visible )
			obj.start();
		else if( obj.isRunning && !visible )
			obj.stop( true );
	});
});
