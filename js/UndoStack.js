/**
 * UndoStack:
 * Easy undo-redo in JavaScript.
 **/

var UndoStack = function (self) {
	this.stack = [];
	this.index = -1;
	this.self = self;
};

/**
 * UndoStack#push (undo, redo);
 * data -> Argument passed to undo/redo functions
 * undo -> Function which performs undo based on current state
 * redo -> Function which performs redo based on previous state
 **/
UndoStack.prototype.push = function (data, undo, redo) {
	this.index++;

	// We need to invalidate all undo items after this new one
	// or people are going to be very confused.
	this.stack.splice(this.index);
	this.stack.push(new UndoItem(undo, redo, data));
};

UndoStack.prototype.undo = function () {
	var item;

	if (this.index >= 0) {
		item = this.stack[this.index];
		item.undo.call(this.self, item.data);
		this.index--;
	} else {
		throw new Error("Already at oldest change");
	}
};

UndoStack.prototype.redo = function () {
	var item;

	item = this.stack[this.index + 1];
	if (item) {
		item.redo.call(this.self, item.data);
		this.index++;
	} else {
		throw new Error("Already at newest change");
	}
};


var UndoItem = function (undo, redo, data) {
	this.undo = undo;
	this.redo = redo;
	this.data = data;
};
