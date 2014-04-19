'use strict';

var stream = require('stream'),
    util = require('util'),
    htmlparser = require('htmlparser2');

function MicroshaStream() {
    stream.Transform.call(this, {objectMode: true});

    var _this = this,
        tags = [],
        items = [],
        properties = [],
        item,

        parser = new htmlparser.Parser({
            onopentag: function(tag, attribs) {
                tags.push({name: tag, attribs: attribs});
                var hasScope = attribs.hasOwnProperty('itemscope'),
                    hasProp = attribs.hasOwnProperty('itemprop');

                if (hasScope) {
                    var newItem = {};
                    if (attribs.itemtype) {
                        newItem.itemtype = attribs.itemtype;
                    }

                    if (hasProp) {
                        item[attribs.itemprop] = newItem;
                    }

                    items.push(newItem);
                    item = newItem;
                } else if (hasProp) {
                    var key = attribs.itemprop;
                    item[key] = '';
                    properties.push(key);
                }
            },

            ontext: function(text) {
                properties.forEach(function(property) {
                    item[property] += text;
                });
            },

            onclosetag: function(tag) {
                var tagData = tags.pop(),
                    hasScope = tagData.attribs.hasOwnProperty('itemscope'),
                    hasProp = tagData.attribs.hasOwnProperty('itemprop');
                if (hasScope) {
                    var lastItem = items.pop();
                    item = items[items.length - 1];

                    if (!hasProp) {
                        _this.push(lastItem);
                    }
                } else if (hasProp) {
                    properties.pop();
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
