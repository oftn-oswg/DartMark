"use strict";

/**
 * DartMark things to-do:
 * TODO: Support multiple cursors (somehow).
 * TODO: Support class support and styling.
 * TODO: Copy/paste stack where insert commands
 *       effectively perform a paste.
 * TODO: Don't use window.{prompt,confirm}
 **/

function DartMark(frame) {
	if (!frame) {
		throw new Error("Requires iframe element");
	}

	this.frame = frame;
	this.undostack = new UndoStack(this);
	this.dom = new DartMarkActions();
	this.setupRoot();
}

DartMark.prototype.cursor = null;
DartMark.prototype.newcursor = null;

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
			self.updateCursor();
		} catch (error) {
			self.reportError(error.message);
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
		self.updateCursor();

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

		if (this.dom.isEmpty(node)) {
			node.classList.add("dm_empty");
		}
	}.call(this, node));

	// Add necessary styles
	var sheet = document.createElement("style");
	sheet.innerHTML = ".dm_empty { min-height: 6px; background: url(\"" + location.href + "img/dm_empty.png\") repeat; } .dm_cursor { outline: 3px solid yellow } body { cursor: default; }";
	doc.head.appendChild(sheet);

	// Set root, add keyboard events
	this.root = node;
	this.dom.root = node;
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
	this.newcursor = node;
};

DartMark.prototype.updateCursor = function () {

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
	this.cursor = this.newcursor;
	if (this.cursor) {
		this.scrollTo(this.cursor);
		this.cursor.classList.add(className);
		if (output) {
			output.appendChild(this.generatePath(this.cursor));
		}
	}
};

DartMark.prototype.clearCursor = function () {
	this.changeCursor(null);
};

DartMark.prototype.generatePath = function (element) {
	var ul, li, span, classes;

	ul = document.createElement("ul");
	while (true) {
		li = document.createElement("li");

		li.addEventListener("click", (function (self, element) {
			return function () {
				self.changeCursor(element);
				self.updateCursor();
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

DartMark.prototype.undo = function () {
	this.undostack.undo();
};

DartMark.prototype.redo = function () {
	this.undostack.redo();
};

DartMark.prototype.pushAction = function (perform, data) {
	var return_value;

	return_value = perform.call(this, true, data);
	this.undostack.push(perform, data);

	return return_value;
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
	this.pushAction(
		function (redo, index) {
			var node = this.dom.getNodeFromIndex(index[0]);
			if (redo) {
				this.dom.createPrev(node);
			} else {
				this.dom.removePrev(node);
			}
			// Our index has changed :(
			index[0] = this.dom.getIndexFromNode(node);
		},
		[this.dom.getIndexFromNode(this.cursor)]
	);

};

DartMark.prototype.createNext = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.pushAction(
		function (redo, index) {
			var node = this.dom.getNodeFromIndex(index);
			if (redo) {
				this.dom.createNext(node);
			} else {
				this.dom.removeNext(node);
			}
		},
		this.dom.getIndexFromNode(this.cursor)
	);

};

DartMark.prototype.createFirst = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.pushAction(
		function (redo, index) {
			var node = this.dom.getNodeFromIndex(index);
			if (redo) {
				this.dom.createFirst(node);
			} else {
				this.dom.removeFirst(node);
			}
		},
		this.dom.getIndexFromNode(this.cursor)
	);

};

DartMark.prototype.createLast = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.pushAction(
		function (redo, index) {
			var node = this.dom.getNodeFromIndex(index);
			if (redo) {
				this.dom.createLast(node);
			} else {
				this.dom.removeLast(node);
			}
		},
		this.dom.getIndexFromNode(this.cursor)
	);
};

DartMark.prototype.createParent = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	this.pushAction(
		function (redo, index) {
			var node = this.dom.getNodeFromIndex(index[0]);
			if (redo) {
				this.dom.createParent(node);
			} else {
				this.dom.removeParent(node);
			}
			// Our index has changed :(
			index[0] = this.dom.getIndexFromNode(node);
		},
		[this.dom.getIndexFromNode(this.cursor)]
	);
};

DartMark.prototype.editID = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}

	var from = this.cursor.id;

	this.prompt("Element ID:", function (success, to) {
		if (success) {
			this.pushAction(
				function (redo, data) {
					this.dom.editID(this.cursor, redo ? data.to : data.from);
				},
				[this.dom.getIndexFromNode(this.cursor), from, to]
			);
		}
	}, from);
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

	this.pushAction(
		function (redo, data) {
			if (redo) {
				this.dom.removeNode(this.dom.getNodeFromIndex(data[0]));
			} else {
				this.dom.insertNodeAt(data[1], data[0]);
			}
		},
		[this.dom.getIndexFromNode(this.cursor), this.cursor]
	);
	this.changeCursor(cursor);
};

DartMark.prototype.replaceText = function () {
	if (!this.cursor) {
		throw new Error("No node selected");
	}
	var text = this.dom.textContent(this.cursor);
	this.prompt("Text contents:", function (success, text) {
		var data, node, children;

		// Save current child nodes
		children = [];
		node = this.cursor.firstChild;
		do {
			children.push(node);
			node = node.nextSibling;
		} while (node);

		data = {
			node: this.dom.getIndexFromNode(this.cursor),
			from: children,
			to: text
		};

		if (success) {
			this.pushAction(
				function (redo, data) {
					var node = this.dom.getNodeFromIndex(data.node);
					if (redo) {
						this.dom.replaceText(this.cursor, data.to);
					} else {
						while (node.lastChild) {
							node.removeChild(node.lastChild);
						}
						for (var i = 0, len = data.from.length; i < len; i++) {
							node.appendChild(data.from[i]);
						}
					}
				},
				data
			);
		}
	}, text);
};

DartMark.prototype.replaceElement = function () {
	var from;

	if (!this.cursor) {
		throw new Error("No node selected");
	}

	from = this.cursor.nodeName.toLowerCase();

	this.prompt("Tag name:(e.g. h1, p, ul, li)", function (success, to) {
		var data;

		data = {
			node: this.dom.getIndexFromNode(this.cursor),
			from: from,
			to: to
		};

		if (success) {
			this.pushAction(
				function (redo, data) {
					var node = this.dom.getNodeFromIndex(data.node);
					var sub = this.dom.replaceElement(node, redo ? data.to : data.from);
					if (node === this.cursor) {
						this.changeCursor(sub);
					}
				},
				data
			);
		}
	}, from);
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
