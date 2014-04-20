'use strict';

var stream = require('stream'),
    url = require('url'),
    util = require('util'),
    htmlparser = require('htmlparser2');

function ItemsBuilder() {
    this._items = [];
    this._item = null;
    this._properties = [];
}

ItemsBuilder.prototype.beginItem = function(id, types) {
    this._item = {};
    if (id) {
        this._item.id = id;
    }
    if (types) {
        this._item.type = types;
    }
    this._items.push(this._item);
    return this._item;
};

ItemsBuilder.prototype.beginNestedItem = function(propertyKey, id, types) {
    var root = this._item;
    root.properties = root.properties || {};
    root.properties[propertyKey] = root.properties[propertyKey] || [];
    root.properties[propertyKey].push(this.beginItem(id, types));
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

var SPECIAL_TAGS = {
    meta: 'content',
    data: 'value',
    meter: 'value',
};

var URL_TAGS = {
    audio: 'src',
    embed: 'src',
    iframe: 'src',
    img: 'src',
    source: 'src',
    track: 'src',
    video: 'src',

    a: 'href',
    area: 'href',
    link: 'href',

    object: 'data'
};

function MicroshaStream(opts) {
    opts = opts || {};
    opts.rootURL = opts.rootURL || '';
    stream.Transform.call(this, {objectMode: true});

    var _this = this,
        tags = [],
        builder = new ItemsBuilder(),

        beginProperties = function beginProperties(itempropAttr) {
            itempropAttr.split(' ').forEach(function(property) {
                builder.beginTextProperty(property);
            });

        },

        endProperties = function endProperties(itempropAttr) {
            itempropAttr.split(' ').forEach(function() {
                builder.endTextProperty();
            });
        },

        parser = new htmlparser.Parser({
            onopentag: function(tag, attribs) {
                var tagData = {name: tag, attribs: attribs, proccessed: false},
                    hasScope = attribs.hasOwnProperty('itemscope'),
                    hasProp = attribs.hasOwnProperty('itemprop'),

                    createTextProperties = function createTextProperties(value) {
                        builder.addText(value);
                        endProperties(attribs.itemprop);

                        tagData.proccessed = true;
                    };

                if (hasScope) {
                    var types = attribs.itemtype ? attribs.itemtype.split(' ') : null;
                    if (hasProp) {
                        builder.beginNestedItem(attribs.itemprop, attribs.itemid, types);
                    } else {
                        builder.beginItem(attribs.itemid, types);
                    }

                } else if (hasProp) {
                    beginProperties(attribs.itemprop);

                    var attr;
                    if (tag === 'time' && attribs.datetime) {
                        //special case for time element: if no
                        //datetime specified, it should use text
                        //content as a value, the same way as
                        //non-special and non-url tags.
                        createTextProperties(attribs.datetime);
                    } else if (SPECIAL_TAGS[tag]) {
                        attr = SPECIAL_TAGS[tag];
                        createTextProperties(attribs[attr] || '');
                    } else if (URL_TAGS[tag]) {
                        attr = URL_TAGS[tag];
                        var value = attribs[attr] ?
                            url.resolve(opts.rootURL, attribs[attr]) :
                            '';
                        createTextProperties(value);
                    }
                }

                tags.push(tagData);
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
                } else if (hasProp && !tagData.proccessed) {
                    endProperties(tagData.attribs.itemprop);
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
