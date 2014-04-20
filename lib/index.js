'use strict';

var stream = require('stream'),
    util = require('util'),
    htmlparser = require('htmlparser2');

function ItemsBuilder() {
    this._items = [];
    this._item = null;
    this._properties = [];
}

ItemsBuilder.prototype.beginItem = function(types) {
    this._item = {};
    if (types) {
        this._item.type = types;
    }
    this._items.push(this._item);
    return this._item;
};

ItemsBuilder.prototype.beginNestedItem = function(propertyKey, type) {
    var root = this._item;
    root.properties = root.properties || {};
    root.properties[propertyKey] = root.properties[propertyKey] || [];
    root.properties[propertyKey].push(this.beginItem(type));
    return this._item;
};

ItemsBuilder.prototype.endItem = function() {
    var finishedItem = this._items.pop();
    this._item = this._items[this._items.length - 1];
    return finishedItem;
};

ItemsBuilder.prototype.beginTextProperty = function(propertyKey) {
    this._item.properties = this._item.properties || {};
    this._item.properties[propertyKey] = this._item.properties[propertyKey] || [];
    this._item.properties[propertyKey].push('');
    this._properties.push(propertyKey);
};

ItemsBuilder.prototype.addText = function(text) {
    this._properties.forEach(function(property) {
        var properties = this._item.properties[property];
        properties[properties.length - 1] += text;
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
                    var types = attribs.itemtype ? attribs.itemtype.split(' ') : null;
                    if (hasProp) {
                        builder.beginNestedItem(attribs.itemprop, types);
                    } else {
                        builder.beginItem(types);
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
