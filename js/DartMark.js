"use strict";

/**
 * DartMark things to-do:
 * TODO: Undo/redo support.
 * TODO: Support multiple cursors (somehow).
 * TODO: Support class support and styling.
 * TODO: Copy/paste stack where insert commands
 *       effectively perform a paste.
 **/

function DartMark(frame) {
	if (!frame) {
		throw new Error("Requires iframe element");
	}

	this.frame = frame;
	this.acts = new DartMarkActions;
	this.setupRoot();
}

DartMark.prototype.output_help = null;
DartMark.prototype.output_error = null;
DartMark.prototype.output_breadcrumb = null;

DartMark.prototype.frozen = false;
DartMark.prototype.shortcuts = {};

DartMark.prototype.addEvents = function (element) {
	var mapping, self;

	self = this;

	mapping = [];
	mapping[8] = "Backspace";
	mapping[9] = "Tab";
	mapping[13] = "Enter";
	mapping[27] = "Escape";
	mapping[32] = "Space";
	mapping[33] = "PageUp";
	mapping[34] = "PageDown";
	mapping[37] = "Left";
	mapping[38] = "Up";
	mapping[39] = "Right";
	mapping[40] = "Down";
	mapping[46] = "Delete";

	element.addEventListener("keydown", function (e) {
		var action, func, key;

		if (self.frozen || e.ctrlKey || e.metaKey || e.altKey) {
			return;
		}

		self.reportError(false);

		key = e.keyCode;
		if (key >= 65 && key <= 90) {
			key = String.fromCharCode(key);
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
			func.call(self);
		} catch (e) {
			self.reportError(e.message);
		}

		e.preventDefault();
		return false;
	});

	element.addEventListener("mousedown", function (e) {
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

		self.changeCursor(target);
		self.frame.contentWindow.focus();

		e.preventDefault();
		e.stopPropagation();
		return false;
	});
};

DartMark.prototype.reportError = function (message) {
	var output;

	output = this.output_error;
	if (!output) {
		return;
	}

	if (message === false) {
		output.classList.add("hidden");
	} else {
		output.classList.remove("hidden");
		while (output.firstChild) {
			output.removeChild(output.firstChild);
		}
		output.appendChild(document.createTextNode(String(message)));
	}
};

DartMark.prototype.setupRoot = function (callback) {
	var node, doc, win, self;

	self = this;
	win = this.frame.contentWindow;
	doc = win.document;

	// Check the ready state of the frame.
	// If it's not loaded, recall this function later.
	if (doc.readyState !== "complete") {
		win.addEventListener("load", function load() {
			win.removeEventListener("load", load, false);
			self.setupRoot(callback);
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
				check.call(this, child);
			}
			child = child.nextSibling;
		}

		if (this.acts.isEmpty(node)) {
			node.classList.add("dm_empty");
		}
	}.call(this, node));

	// Add necessary styles
	var sheet = document.createElement("style");
	sheet.innerHTML = ".dm_empty { min-height: 6px; background: url(\"" + location.href + "img/dm_empty.png\") repeat; } .dm_cursor { outline: 3px solid yellow } body { cursor: default; }";
	doc.head.appendChild(sheet);

	// Set root, add keyboard events
	this.root = node;
	this.acts.root = node;
	this.walker = doc.createTreeWalker(node, 1, null, false);
	this.addEvents(this.frame.contentWindow);

	win.focus();

	if (callback) {
		callback.call(this);
	}
};

DartMark.prototype.scrollTo = function (element) {
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

	if (offsetTop > scrollTop && offsetHeight <= scrollHeight) {
		var bottom = offsetTop + offsetHeight;
		if (bottom > scrollTop + scrollHeight) {
			scroll = bottom - scrollHeight + margin;
		} else {
			return;
		}
	} else {
		scroll = offsetTop - margin;
	}

	this.frame.contentWindow.scrollTo(0, scroll);
};

DartMark.prototype.changeCursor = function (node) {
	var className = "dm_cursor";
	var output;

	output = this.output_breadcrumb;

	// Remove current selection
	if (this.cursor) {
		this.cursor.classList.remove(className);
		if (output) {
			while (output.firstChild) {
				output.removeChild(output.firstChild);
			}
		}
	}

	// Add new selection
	this.cursor = node;
	if (this.cursor) {
		this.scrollTo(this.cursor);
		this.cursor.classList.add(className);
		if (output) {
			output.appendChild(this.generatePath(this.cursor));
		}
	}
};

DartMark.prototype.updateCursor = function() {
	this.changeCursor (this.cursor);
};

DartMark.prototype.clearCursor = function () {
	this.changeCursor(null);
};

DartMark.prototype.getElementFromIndex = function (index) {
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

DartMark.prototype.getIndexFromElement = function (element) {
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
		index.unshift(i);
	}

	return index;
};

DartMark.prototype.generatePath = function (element) {
	var ul, li, span, classes;

	ul = document.createElement("ul");
	while (true) {
		li = document.createElement("li");

		li.addEventListener("click", (function (self, element) {
			return function () {
				self.changeCursor (element);
			};
		}(this, element)));

		span = document.createElement("span");
		span.classList.add("dm_nodename");
		span.appendChild(document.createTextNode(element.nodeName.toLowerCase()));
		li.appendChild(span);

		classes = element.className.split(/\s+/);
		for (var i = 0, len = classes.length; i < len; i++) {
			if (!classes[i] || /^dm_/.test(classes[i])) {
				continue;
			}

			span = document.createElement("span");
			span.classList.add("dm_classname");
			span.appendChild(document.createTextNode("." + classes[i]));
			li.appendChild(span);
		}

		if (element.id) {
			span = document.createElement("span");
			span.classList.add("dm_id");
			span.appendChild(document.createTextNode("#" + element.id));
			li.appendChild(span);
		}

		ul.insertBefore(li, ul.firstChild);

		if (element === this.root) {
			break;
		}

		element = element.parentNode;
	}

	return ul;
};


DartMark.prototype.prompt = function (directive, callback, original) {
	var response;

	this.frozen = true;

	response = window.prompt(directive, original);

	this.frozen = false;
	if (response === null) {
		callback.call(this, false);
	} else {
		callback.call(this, true, response);
	}
};

DartMark.prototype.confirm = function (directive, callback) {
	var response;

	this.frozen = true;
	response = window.confirm(directive);
	this.frozen = false;

	callback.call(this, response);
};

DartMark.prototype.moveForward = function () {
	var node, walker;

	if (!this.cursor) {
		node = this.root;
	} else {
		walker = this.walker;
		walker.currentNode = this.cursor;
		node = walker.nextNode();
	}

	this.changeCursor(node);
};

DartMark.prototype.moveBackward = function () {
	var node, walker;

	walker = this.walker;

	if (!this.cursor) {
		walker.currentNode = this.root;
		while (walker.nextNode()) {
			continue;
		}
		node = walker.currentNode;
	} else {
		walker.currentNode = this.cursor;
		node = walker.previousNode();
	}

	this.changeCursor(node);
};

DartMark.prototype.movePrev = function () {
	var walker, node;

	// Change cursor to nodeious sibling
	if (!this.cursor) {
		node = this.root;
	} else if (this.cursor === this.root) {
		return;
	} else {
		walker = this.walker;
		walker.currentNode = this.cursor;
		node = walker.previousSibling();
		if (!node) {
			walker.parentNode();
			node = walker.lastChild();
		}
	}

	this.changeCursor(node);
};

DartMark.prototype.moveNext = function () {
	var walker, node;

	// Change cursor to node sibling
	if (!this.cursor) {
		node = this.root;
	} else if (this.cursor === this.root) {
		return;
	} else {
		walker = this.walker;
		walker.currentNode = this.cursor;
		node = walker.nextSibling();
		if (!node) {
			walker.parentNode();
			node = walker.firstChild();
		}
	}

	this.changeCursor(node);
};

DartMark.prototype.moveChild = function () {
	var walker, node;

	if (!this.cursor) {
		node = this.root;
	} else {
		walker = this.walker;
		walker.currentNode = this.cursor;
		node = walker.firstChild();
		if (!node) {
			throw new Error("Node has no children");
		}
	}

	this.changeCursor(node);
};

DartMark.prototype.moveUp = function () {
	var node;

	if (!this.cursor) {
		node = this.root;
	} else if (this.cursor === this.root) {
		return;
	} else {
		node = this.cursor.parentNode;
	}

	this.changeCursor(node);
};

DartMark.prototype.moveFirst = function () {
	var walker, node;

	if (!this.cursor) {
		node = this.root;
	} else if (this.cursor === this.root) {
		return;
	} else {
		walker = this.walker;
		walker.currentNode = this.cursor;
		walker.parentNode();
		node = walker.firstChild();
	}
	this.changeCursor(node);
};

DartMark.prototype.moveLast = function () {
	var walker, node;

	if (!this.cursor) {
		node = this.root;
	} else if (this.cursor === this.root) {
		return;
	} else {
		walker = this.walker;
		walker.currentNode = this.cursor;
		walker.parentNode();
		node = walker.lastChild();
	}
	this.changeCursor(node);
};

DartMark.prototype.createPrev = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.acts.createPrev(this.cursor);
};

DartMark.prototype.createNext = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.acts.createNext(this.cursor);
};

DartMark.prototype.createFirst = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.acts.createFirst(this.cursor);
};

DartMark.prototype.createLast = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.acts.createLast(this.cursor);
};

DartMark.prototype.createParent = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.acts.createParent(this.cursor);
	this.updateCursor();
};

DartMark.prototype.editID = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}

	this.prompt("Element ID:", function (success, text) {
		if (success) {
			this.acts.editID(this.cursor, text);
			this.updateCursor();
		}
	}, this.cursor.id);
};

DartMark.prototype.removeNode = function () {
	var cursor, walker;

	if (!this.cursor) {
		throw new Error("No node selected");
	}

	walker = this.walker;
	walker.currentNode = this.cursor;

	// The new cursor should be on
	// the next, or the previous, or the parent.
	cursor = walker.nextSibling();
	if (!cursor) {
		cursor = walker.previousSibling();
		if (!cursor) {
			cursor = walker.parentNode();
		}
	}

	this.acts.removeNode(this.cursor);
	this.changeCursor(cursor);
};

DartMark.prototype.replaceText = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	var text = this.acts.textContent(this.cursor);
	this.prompt("Text contents:", function (success, text) {
		if (success) {
			this.acts.replaceText(this.cursor, text);
		}
	}, text);
};

DartMark.prototype.replaceElement = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.prompt("Tag name:(e.g. h1, p, ul, li)", function (success, text) {
		if (success) {
			this.changeCursor(this.acts.replaceElement(this.cursor, text));
		}
	}, this.cursor.nodeName.toLowerCase());
};

DartMark.prototype.toggleHelp = function () {
	var help;

	help = this.output_help;
	if (help) {
		help.classList.toggle("hidden");
	} else {
		throw new Error("Bug! Information box could not be located.");
	}
};
