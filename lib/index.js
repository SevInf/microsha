'use strict';

var stream = require('stream'),
    util = require('util'),
    htmlparser = require('htmlparser2');

function ItemsBuilder() {
    this._items = [];
    this._item = null;
    this._properties = [];
}

ItemsBuilder.prototype.beginItem = function(type) {
    this._item = {};
    if (type) {
        this._item.itemtype = type;
    }
    this._items.push(this._item);
    return this._item;
};

ItemsBuilder.prototype.beginNestedItem = function(propertyKey, type) {
    var root = this._item;
    root[propertyKey] = this.beginItem(type);
    return this._item;
};

ItemsBuilder.prototype.endItem = function() {
    var finishedItem = this._items.pop();
    this._item = this._items[this._items.length - 1];
    return finishedItem;
};

ItemsBuilder.prototype.beginTextProperty = function(propertyKey) {
    this._item[propertyKey] = '';
    this._properties.push(propertyKey);
};

ItemsBuilder.prototype.addText = function(text) {
    this._properties.forEach(function(property) {
        this._item[property] += text;
    }, this);
};

ItemsBuilder.prototype.endTextProperty = function() {
    this._properties.pop();
};


function MicroshaStream() {
    stream.Transform.call(this, {objectMode: true});

    var _this = this,
        tags = [],
        builder = new ItemsBuilder(),

        parser = new htmlparser.Parser({
            onopentag: function(tag, attribs) {
                tags.push({name: tag, attribs: attribs});
                var hasScope = attribs.hasOwnProperty('itemscope'),
                    hasProp = attribs.hasOwnProperty('itemprop');

                if (hasScope) {
                    if (hasProp) {
                        builder.beginNestedItem(attribs.itemprop, attribs.itemtype);
                    } else {
                        builder.beginItem(attribs.itemtype);
                    }

                } else if (hasProp) {
                    builder.beginTextProperty(attribs.itemprop);
                }
            },

            ontext: function(text) {
                builder.addText(text);
            },

            onclosetag: function(tag) {
                var tagData = tags.pop(),
                    hasScope = tagData.attribs.hasOwnProperty('itemscope'),
                    hasProp = tagData.attribs.hasOwnProperty('itemprop');
                if (hasScope) {
                    var item = builder.endItem();

                    if (!hasProp) {
                        _this.push(item);
                    }
                } else if (hasProp) {
                    builder.endTextProperty();
                }
            }
        }, {recoginzeSelfClosing: true});

    this._transform = function _transform(chunk, encoding, callback) {
        parser.write(chunk);
        callback();
    };
}

util.inherits(MicroshaStream, stream.Transform);

exports.Stream = MicroshaStream;
