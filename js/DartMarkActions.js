var DartMarkActions = function (root) {
	this.root = root;
};

DartMarkActions.prototype = {

	// Utility functions

	generateNode: function (name, nonempty) {
		var node = document.createElement(name || "div");
		if (!nonempty) {
			node.classList.add("dm_empty");
		}
		return node;
	},

	textContent: function (node) {
		return (node.innerText || node.textContent).replace(/^\s+|\s+$/g, "");
	},

	isEmpty: function (node) {
		var child, empty;
		child = node.firstChild;
		empty = true;
		while (child) {
			if (child.nodeType === 1) {
				empty = false;
				break;
			} else if (child.nodeType === 3) {
				// An element with text nodes will
				// be defined "empty" if it's just
				// whitespace.
				if (!/^\s*$/.test(child.data)) {
					empty = false;
					break;
				}
			}
			child = child.nextSibling;
		}
		return empty;
	},


	// Actions

	createPrev: function (node) {
		if (node === this.root) {
			throw new Error("Cannot create node before root node");
		}
		node.parentNode.insertBefore(this.generateNode(), node);
	},

	createNext: function (node) {
		if (node === this.root) {
			throw new Error("Cannot create node after root node");
		}
		node.parentNode.insertBefore(this.generateNode(), node.nextSibling);
	},

	createFirst: function (node) {
		node.classList.remove("dm_empty");
		node.insertBefore(this.generateNode(), node.firstChild);
	},

	createLast: function (node) {
		node.classList.remove("dm_empty");
		node.appendChild(this.generateNode());
	},

	createParent: function (node) {
		if (node === this.root) {
			throw new Error("Cannot reparent root node");
		}
		var replacement = this.generateNode(null, true);
		node.parentNode.replaceChild(replacement, node);
		replacement.appendChild(node);
	},

	replaceElement: function (node, tag) {
		if (node === this.root) {
			throw new Error("Cannot change element type of root node");
		}
		var handle, child = node.firstChild, replacement = this.generateNode(tag, node.classList.contains("dm_empty"));
		while (child) {
			handle = child.nextSibling;
			replacement.appendChild(child);
			child = handle;
		}
		if (node.className) { replacement.className = node.className; }
		if (node.id) { replacement.setAttribute("id", node.id); }
		node.parentNode.replaceChild(replacement, node);
		return replacement;
	},

	replaceText: function (node, text) {
		while (node.lastChild) {
			node.removeChild(node.lastChild);
		}
		node.appendChild(document.createTextNode(text));
		if (this.isEmpty(node)) {
			node.classList.add("dm_empty");
		} else {
			node.classList.remove("dm_empty");
		}
	},

	removeNode: function (node) {
		if (node === this.root) {
			throw new Error("Cannot remove root node");
		}
		var parent = node.parentNode;
		parent.removeChild(node);
		if (this.isEmpty(parent)) {
			parent.classList.add("dm_empty");
		}
	},

	editID: function (node, id) {
		if (!id) {
			node.removeAttribute("id");
		} else if (!/^\S+$/.test(id)) {
			throw new Error("IDs must contain no space characters and be non-empty");
		} else if (node.ownerDocument.getElementById(id)) {
			throw new Error("ID already exists in the document");
		} else {
			node.setAttribute("id", id);
		}
	}

};
