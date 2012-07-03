/**
 * DartMark things to-do:
 * TODO: Undo/redo support.
 * TODO: Allow clicking breadcrumb to move cursor.
 * TODO: Support multiple cursors (somehow).
 * TODO: Support class support and styling.
 * TODO: Separate DOM handling code
 *       and DartMark core and interface code
 **/

function DartMark(frame) {
	"use strict";

	if (!frame) {
		throw new Error("Requires iframe element");
	}

	this.frozen = false;
	this.frame = frame;
	this.setupRoot (function() {
		this.changeCursor (this.root);
	});
}

DartMark.prototype.shortcuts = {

	Space: "toggleHelp",

	Escape: "clearCursor",
	Tab: "moveForward",
	ShiftTab: "moveBack",
	Left: "moveUp",
	Right: "moveChild",
	Up: "movePrev",
	Down: "moveNext",

	P: "createPrev",
	N: "createNext",
	B: "createFirst",
	A: "createLast",
	W: "createParent",

	I: "editID",

	D: "removeNode",
	Delete: "removeNode",

	Enter: "replaceText",
	E: "replaceElement"

};

DartMark.prototype.addEvents = function(element) {
	"use strict";

	var mapping, self;

	self = this;

	mapping = [];
	mapping[8] = "Backspace";
	mapping[9] = "Tab";
	mapping[13] = "Enter";
	mapping[27] = "Escape";
	mapping[32] = "Space";
	mapping[37] = "Left";
	mapping[38] = "Up";
	mapping[39] = "Right";
	mapping[40] = "Down";
	mapping[46] = "Delete";

	element.addEventListener ("keydown", function(e) {
		var action, func, key, match, ascii;

		if (self.frozen || e.ctrlKey || e.metaKey || e.altKey) {
			return;
		}

		self.reportError (false);

		key = e.keyCode;
		if (key >= 65 && key <= 90) {
			key = String.fromCharCode (key);
		} else {
			key = mapping[key] || key;
		}

		if (e.shiftKey) {
			key = "Shift" + key;
		}

		action = self.shortcuts[key];
		func = self[action];

		if (!action || typeof func !== "function") {
			return;
		}

		try {
			func.call (self);
		} catch (e) {
			self.reportError (e.message);
		}

		e.preventDefault ();
		return false;
	});

	element.addEventListener ("mousedown", function(e) {
		var target;

		if (self.frozen) {
			return;
		}

		target = e.target;
		if (target.nodeType === 3) {
			target = target.parentNode;
		}

		if (target === self.frame.contentWindow.document.documentElement) {
			target = self.root;
		}

		self.changeCursor (target);
		self.frame.contentWindow.focus ();

		e.preventDefault ();
		e.stopPropagation ();
		return false;
	});
};

DartMark.prototype.reportError = function(message) {
	"use strict";

	var output;

	output = document.getElementById ("dm_error");
	if (message === false) {
		output.classList.add ("hidden");
	} else {
		output.classList.remove ("hidden");
		while (output.firstChild) {
			output.removeChild (output.firstChild);
		}
		output.appendChild (document.createTextNode (String (message)));
	}
};

DartMark.prototype.setupRoot = function(callback) {
	"use strict";

	var node, doc, win, self;

	self = this;
	win = this.frame.contentWindow;
	doc = win.document;

	// Check the ready state of the frame.
	// If it's not loaded, recall this function later.
	if (doc.readyState !== "complete") {
		win.addEventListener ("load", function load() {
			win.removeEventListener ("load", load, false);
			self.setupRoot (callback);
		}, false);
		return;
	}

	// Check for empty nodes
	node = doc.body;

	(function check(node) {
		var child;
		
		child = node.firstChild;

		while (child) {
			if (child.nodeType === 1) {
				check.call (this, child);
			}
			child = child.nextSibling;
		}

		if (this.isEmpty (node)) {
			node.classList.add ("dm_empty");
		}
	}).call (this, node);

	// Clear all children
	/*while (node.lastChild) {
		node.removeChild (node.lastChild);
	}*/

	// Add necessary styles
	var sheet = document.createElement ("style");
	sheet.innerHTML = ".dm_empty { min-height: 6px; background: url(\""+location.href+"img/dm_empty.png\") repeat; } .dm_cursor { outline: 3px solid yellow } body { cursor: default; }";
	doc.head.appendChild (sheet);

	// Set root, add keyboard events
	this.root = node;
	this.walker = doc.createTreeWalker (node, NodeFilter.SHOW_ELEMENT);
	this.addEvents (this.frame.contentWindow);

	win.focus ();

	callback.call (this);
};

DartMark.prototype.generateNode = function(name, empty) {
	"use strict";

	var node;

	node = document.createElement (name || "div");

	if (empty) {
		node.classList.add ("dm_empty");
	}

	return node;
};

DartMark.prototype.scrollTo = function(element) {
	"use strict";

	var win, node, offsetTop, offsetHeight, scrollTop, scrollHeight, scroll, margin;

	margin = 64;

	win = this.frame.contentWindow;
	scrollTop = win.scrollY;
	scrollHeight = win.innerHeight;

	offsetTop = 0;
	offsetHeight = element.offsetHeight;

	node = element;
	do {
		offsetTop += node.offsetTop;
		node = node.offsetParent;
	} while (node);

	/**
	 * Warning: The following code may hurt your eyes.
	 * Just remember that it used to be a lot worse.
	 *
	 * Process:
	 * if (element top is below the top && fits entirely in the screen):
	 *     if (element bottom is below the bottom):
	 *         meet bottom of element with bottom of screen
	 *     else:
	 *         do nothing;
	 * else:
	 *     meet top of element with top of screen
	 *
	 **/

	if (offsetTop - scrollTop > 0 && offsetHeight <= scrollHeight) {
		var bottom = offsetTop + offsetHeight;
		if (bottom > scrollTop + scrollHeight) {
			scroll = bottom - scrollHeight + margin;
		} else {
			return;
		}
	} else {
		scroll = offsetTop - margin;
	}

	this.frame.contentWindow.scrollTo (0, scroll);
};

DartMark.prototype.changeCursor = function(node) {
	"use strict";

	var className = "dm_cursor";
	var output;

	output = document.getElementById ("dm_selected");

	// Remove current selection
	if (this.cursor) {
		this.cursor.classList.remove (className);
		while (output.firstChild) {
			output.removeChild (output.firstChild);
		}
	}

	// Add new selection
	this.cursor = node;
	if (this.cursor) {
		this.scrollTo (this.cursor);
		this.cursor.classList.add (className);
		output.appendChild (this.generatePath (this.cursor));
	}
};

DartMark.prototype.getElementFromIndex = function(index) {
	var node, i, len;

	i = 0;
	len = index.length;
	node = this.root;

	while (i < len) {
		if (!node) {
			return false;
		}
		node = node.childNodes[index[i]];
		i++;
	}

	return node;
};

DartMark.prototype.getIndexFromElement = function(element) {
	var index, node, onode, i;

	index = [];
	node = element;

	while (node) {

		if (node === this.root) {
			break;
		}

		i = -1;
		onode = node;
		while (node) {
			node = node.previousSibling;
			i++;
		}
		node = onode.parentNode;
		index.unshift (i);
	}

	return index;
};

DartMark.prototype.generatePath = function(element) {
	"use strict";

	var ul, li, span, classes;

	ul = document.createElement ("ul");
	while (true) {
		li = document.createElement ("li");

		span = document.createElement ("span");
		span.classList.add ("dm_nodename");
		span.appendChild (document.createTextNode (element.nodeName.toLowerCase ()));
		li.appendChild (span);

		classes = element.className.split (/\s+/);
		for (var i = 0, len = classes.length; i < len; i++) {
			if (!classes[i] || /^dm_/.test (classes[i])) {
				continue;
			}

			span = document.createElement ("span");
			span.classList.add ("dm_classname");
			span.appendChild (document.createTextNode ("." + classes[i]));
			li.appendChild (span);
		}

		if (element.id) {
			span = document.createElement ("span");
			span.classList.add ("dm_id");
			span.appendChild (document.createTextNode ("#" + element.id));
			li.appendChild (span);
		}

		ul.insertBefore (li, ul.firstChild);

		if (element === this.root) {
			break;
		}

		element = element.parentNode;
	}

	return ul;
};

DartMark.prototype.isEmpty = function(node) {
	"use strict";

	var child, empty;
	
	child = node.firstChild;
	empty = true;

	while (child) {
		if (child.nodeType === 1) {
			empty = false;
		} else if (child.nodeType === 3) {

			// An element with text nodes will
			// be defined "empty" if it's just
			// whitespace.
			if (!/^\s*$/.test (child.data)) {
				empty = false;
			}

		}
		child = child.nextSibling;
	}

	return empty;
};

DartMark.prototype.prompt = function(directive, callback, original) {
	"use strict";

	var response;

	this.frozen = true;

	response = window.prompt (directive, original);

	this.frozen = false;
	if (response === null) {
		callback.call (this, false);
	} else {
		callback.call (this, true, response);
	}
};

DartMark.prototype.confirm = function(directive, callback) {
	"use strict";

	var response;

	this.frozen = true;
	response = window.confirm (directive);
	this.frozen = false;

	callback.call (this, response);
};

DartMark.prototype.clearCursor = function() {
	"use strict";

	this.changeCursor (null);
};

DartMark.prototype.moveForward = function() {
	var node, walker;

	if (!this.cursor) {
		node = this.root;
	} else {
		walker = this.walker;
		walker.currentNode = this.cursor;
		node = walker.nextNode ();
	}

	this.changeCursor (node);
};

DartMark.prototype.moveBack = function() {
	var node, walker;

	walker = this.walker;

	if (!this.cursor) {
		walker.currentNode = this.root;
		while (walker.nextNode ());
		node = walker.currentNode;
	} else {
		walker.currentNode = this.cursor;
		node = walker.previousNode ();
	}

	this.changeCursor (node);
};

DartMark.prototype.movePrev = function() {
	"use strict";

	var prev;

	// Change cursor to previous sibling
	if (!this.cursor) {
		prev = this.root;
	} else if (this.cursor === this.root) {
		throw new Error ("Root node has no previous node");
	} else {
		prev = this.cursor;

		do {
			prev = prev.previousSibling;
			if (!prev) {
				prev = this.cursor.parentNode.lastChild;
			}
		} while (prev && prev.nodeType !== 1);
	}

	this.changeCursor (prev);
};

DartMark.prototype.moveNext = function() {
	"use strict";

	var next;

	// Change cursor to next sibling
	if (!this.cursor) {
		next = this.root;
	} else if (this.cursor === this.root) {
		throw new Error ("Root node has no next node");
	} else {
		next = this.cursor;
		
		do {
			next = next.nextSibling;
			if (!next) {
				next = this.cursor.parentNode.firstChild;
			}
		} while (next && next.nodeType !== 1);
	}

	this.changeCursor (next);
};

DartMark.prototype.moveChild = function() {
	"use strict";

	var child;

	// Change cursor to first child node
	if (!this.cursor) {
		child = this.root;
	} else {

		child = this.cursor.firstChild;

		// Skip text nodes
		while (child && child.nodeType !== 1) {
			child = child.nextSibling;
		}

		if (!child) {
			throw new Error ("Node has no children");
		}
	}

	this.changeCursor (child);
};

DartMark.prototype.moveUp = function() {
	"use strict";

	var up;

	// Change cursor to parent node
	if (!this.cursor) {
		up = this.root;
	} else if (this.cursor === this.root) {
		throw new Error ("Root node has no parent node");
	} else {
		up = this.cursor.parentNode;
	}

	this.changeCursor (up);
};

DartMark.prototype.createPrev = function() {
	"use strict";

	var parent, node;

	if (!this.cursor) {
		throw new Error ("No node selected");
	} else if (this.cursor === this.root) {
		throw new Error ("Cannot create node before root node");
	}

	parent = this.cursor.parentNode;
	node = this.generateNode (null, true);

	parent.insertBefore (node, this.cursor);
};

DartMark.prototype.createNext = function() {
	"use strict";

	var parent, node;

	if (!this.cursor) {
		throw new Error ("No node selected");
	} else if (this.cursor === this.root) {
		throw new Error ("Cannot create node after root node");
	}

	parent = this.cursor.parentNode;
	node = this.generateNode (null, true);

	parent.insertBefore (node, this.cursor.nextSibling);
};

DartMark.prototype.createFirst = function() {
	"use strict";

	var parent, node;

	if (!this.cursor) {
		throw new Error ("No node selected");
	}

	parent = this.cursor;
	node = this.generateNode (null, true);

	parent.classList.remove ("dm_empty");
	parent.insertBefore (node, parent.firstChild);
};

DartMark.prototype.createLast = function() {
	"use strict";

	var parent, node;

	if (!this.cursor) {
		throw new Error ("No node selected");
	}

	parent = this.cursor;
	node = this.generateNode (null, true);

	parent.classList.remove ("dm_empty");
	parent.appendChild (node);
};

DartMark.prototype.createParent = function() {
	"use strict";

	var parent, newnode, oldnode;

	if (!this.cursor) {
		throw new Error ("No node selected");
	} else if (this.cursor === this.root) {
		throw new Error ("Cannot reparent root node");
	}

	parent = this.cursor.parentNode;
	newnode = this.generateNode (null, false);
	oldnode = this.cursor;

	parent.replaceChild (newnode, oldnode);
	newnode.appendChild (oldnode);

	this.changeCursor (oldnode);
};

DartMark.prototype.editID = function() {
	"use strict";

	if (!this.cursor) {
		throw new Error ("No node selected");
	}

	this.prompt ("Element ID:", function(success, text) {
		var doc, other;

		if (success) {

			// Check if it's a valid HTML ID
			if (!/^\S+$/.test (text)) {
				throw new Error ("IDs must contain no space characters and be non-empty");
			}


			doc = this.cursor.ownerDocument;
			other = doc.getElementById (text);

			if (other) {
				this.confirm ("ID already exists. Move ID?", function(confirmed) {
					if (confirmed) {
						other.removeAttribute ("id");
						this.cursor.setAttribute ("id", text);
						this.changeCursor (this.cursor);
					}
				});
			} else {
				this.cursor.setAttribute ("id", text);
				this.changeCursor (this.cursor);
			}
		}
	}, this.cursor.id);
};

DartMark.prototype.removeNode = function() {
	"use strict";

	var parent, node, next;

	if (!this.cursor) {
		throw new Error ("No node selected");
	} else if (this.cursor === this.root) {
		throw new Error ("Cannot remove root node");
	}

	parent = this.cursor.parentNode;
	node = this.cursor;

	// The new cursor should be on
	// the next, or the previous, or the parent.
	// Next sibling
	next = this.cursor;
	do {
		next = next.nextSibling;
	} while (next && next.nodeType !== 1);
	
	// Previous sibling
	if (!next) {
		next = this.cursor;
		do {
			next = next.previousSibling;
		} while (next && next.nodeType !== 1);
	}

	// Parent node
	if (!next) {
		next = parent;
	}

	parent.removeChild (node);

	// If parent is now empty, add dm_empty class.
	if (this.isEmpty (parent)) {
		parent.classList.add ("dm_empty");
	}

	this.changeCursor (next);
};

DartMark.prototype.replaceText = function() {
	"use strict";

	if (!this.cursor) {
		throw new Error ("No node selected");
	}

	this.prompt ("Text contents:", function(success, text) {
		var node;

		node = this.cursor;

		if (success) {
			// Remove all children
			while (node.lastChild) {
				node.removeChild (node.lastChild);
			}

			node.appendChild (document.createTextNode (text));

			if (this.isEmpty (node)) {
				node.classList.add ("dm_empty");
			} else {
				node.classList.remove ("dm_empty");
			}
		}
	}, this.cursor.textContent || this.cursor.innerText);
};

DartMark.prototype.replaceElement = function() {
	"use strict";

	if (!this.cursor) {
		throw new Error ("No node selected");
	} else if (this.cursor === this.root) {
		throw new Error ("Cannot change element type of root node");
	}

	this.prompt ("Tag name: (e.g. h1, p, ul, li)", function(success, text) {
		var cursor, node, next, newnode;

		if (success) {
			cursor = this.cursor;
			newnode = this.generateNode (text, this.cursor.classList.contains ("dm_empty"));

			node = cursor.firstChild;
			while (node) {
				next = node.nextSibling;
				newnode.appendChild (node);
				node = next;
			}

			newnode.className = cursor.className;

			if (cursor.id) {
				newnode.setAttribute ("id", cursor.id);
			}

			cursor.parentNode.replaceChild (newnode, cursor);
			this.changeCursor (newnode);
		}
	}, this.cursor.nodeName.toLowerCase ());
};

DartMark.prototype.toggleHelp = function() {
	var help;

	help = document.getElementById ("dm_info");
	if (help) {
		help.classList.toggle ("hidden");
	} else {
		throw new Error ("Bug! Information box could not be located.");
	}
};
