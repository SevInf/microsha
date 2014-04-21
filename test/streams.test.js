'use strict';

var microsha = require('..'),
    sinon = require('sinon'),
    chai = require('chai'),
    expect = chai.expect,
    stream = require('stream');

function strStream(string) {
    var readable = new stream.Readable();
    readable._read = function() {
        readable.push(string);
        readable.push(null);
    };
    return readable;
}

chai.use(function(_chai, utils) {
    var Assertion = _chai.Assertion;

    Assertion.addMethod('emitItem', function(item, done) {

        var _this = this,
            stream = this._obj,
            spy = sinon.spy();

        stream.on('data', spy);
        stream.on('end', function() {
            _this.assert(
                spy.calledWith(item),
                'Expected stream to emit #{exp} item, but #{act} was emitted',
                'Expected stream not to emit #{exp} item',
                item,
                spy.called? spy.firstCall.args[0] : 'nothing',
                spy.called
            );
            done();
        });

    });
});

describe('stream interface', function() {
    beforeEach(function() {
        this.stream = new microsha.Stream();
    });

    it('should emit data event for root for itemscope', function(done) {
        strStream('<div itemscope></div>').pipe(this.stream);
        expect(this.stream).to.emitItem({}, done);
    });

    it('should not emit any data if no itemscope declarations found', function(done) {
        var spy = sinon.spy();

        strStream('<div></div>').pipe(this.stream);
        this.stream.on('data', spy);
        this.stream.on('end', function() {
            expect(spy).not.to.have.been.called;
            done();
        });

    });

    it('should report type if itemtype specified', function(done) {
        strStream('<div itemscope itemtype="http://example.com/Type"></div>')
            .pipe(this.stream);

        expect(this.stream).to.emitItem({
            type: ['http://example.com/Type']
        }, done);
    });

    it('should parse multiple types', function(done) {
        strStream('<div itemscope itemtype="http://example.com/Type1 http://example.com/Type2"></div>')
            .pipe(this.stream);

        expect(this.stream).to.emitItem({
            type: ['http://example.com/Type1', 'http://example.com/Type2']
        }, done);
    });

    it('should parse itemid', function(done) {
        strStream('<div itemscope itemid="id:123"></div>')
            .pipe(this.stream);

        expect(this.stream).to.emitItem({
            id: 'id:123'
        }, done);
    });

    it('should parse item property', function(done) {
        strStream('<div itemscope><div itemprop="property">Value</div></div>')
            .pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                property: ['Value']
            }
        }, done);

    });

    it('should parse multiple properties of the same name', function(done) {
        strStream([
            '<div itemscope>',
                '<span itemprop="property">first</span>',
                '<span itemprop="property">second</span>',
            '</div>'
        ].join('')).pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                property: ['first', 'second']
            }
        }, done);
    });

    it('should parse multiple properties within the same itemprop declaration', function(done) {
        strStream([
            '<div itemscope>',
                '<span itemprop="one two">value</span>',
            '</div>'
        ].join('')).pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                one: ['value'],
                two: ['value']
            }
        }, done);
    });

    it('should ignore markup not in itemprop', function(done) {
        strStream([
            '<div itemscope>',
                'Should be',
                '<span itemprop="property">Value</span>',
                'Ignored',
            '</div>'
        ].join('')).pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                property: ['Value']
            }
        }, done);
    });

    it('should strip all HTML tags from string properties', function(done) {
        strStream('<div itemscope><div itemprop="property"><span>Some</span> <b>Value</b></div></div>')
            .pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                property: ['Some Value']
            }
        }, done);
    });

    describe('properties on a special tags', function() {

        function testUsesAttrAsValue(tag, valueAttr, value) {
            it('should use "' + valueAttr + '" attribute of a <' + tag + '> tag as value', function(done) {
                strStream([
                    '<div itemscope>',
                        '<', tag, ' itemprop="property" ', valueAttr, '="', value, '">Ignore</', tag, '>',
                    '</div>'
                ].join('')).pipe(this.stream);

                expect(this.stream).to.emitItem({
                    properties: {
                        property: [value]
                    }
                }, done);
            });
        }

        function testIgnoresTagWithoutItemprop(tag, valueAttr, value) {
            it('should ignore <' + tag + '> if it has no "itemprop" attribute', function(done) {
                strStream([
                    '<div itemscope>',
                        '<', tag, '', valueAttr, '="', value, '">Ignore</', tag, '>',
                    '</div>'
                ].join('')).pipe(this.stream);

                expect(this.stream).to.emitItem({}, done);
            });
        }

        function testSpecialTagProperty(tag, valueAttr, value) {
            testUsesAttrAsValue(tag, valueAttr, value);
            testIgnoresTagWithoutItemprop(tag, valueAttr, value);

            it('should use empty string if "' + valueAttr + '" is not specified on <' + tag + '>', function(done) {
                strStream([
                    '<div itemscope>',
                        '<', tag, ' itemprop="property" >Ignore</', tag, '>',
                    '</div>'
                ].join('')).pipe(this.stream);

                expect(this.stream).to.emitItem({
                    properties: {
                        property: ['']
                    }
                }, done);

            });

        }

        testSpecialTagProperty('meta', 'content', 'value');
        testSpecialTagProperty('data', 'value', 'some value');
        testSpecialTagProperty('meter', 'value', '5');


        testUsesAttrAsValue('time', 'datetime', '2014-04-20 19:00');
        testIgnoresTagWithoutItemprop('time', 'datetime', '2014-04-20 19:00');

        it('should use text content if "datetime" is not specified on <time>', function(done) {
            strStream([
                '<div itemscope>',
                    '<time itemprop="property">April, 20</time>',
                '</div>'
            ].join('')).pipe(this.stream);

            expect(this.stream).to.emitItem({
                properties: {
                    property: ['April, 20']
                }
            }, done);
        });

        describe('URL properties', function() {
            function testURLProperty(tag, attr) {

                testSpecialTagProperty(tag, attr, 'http://example.com/');

                it('should resolve relative URLS in "' + attr + '" attribute of <' + tag + '> using "rootURL" option', function(done) {
                    this.stream = new microsha.Stream({rootURL: 'http://example.com'});
                    strStream([
                        '<div itemscope>',
                            '<', tag, ' itemprop="property" ', attr, '="some/path">',
                        '</div>'
                    ].join('')).pipe(this.stream);

                    expect(this.stream).to.emitItem({
                        properties: {
                            property: ['http://example.com/some/path']
                        }
                    }, done);
                });
            }

            function testSrcProperty(tag) {
                testURLProperty(tag, 'src');
            }

            function testHrefProperty(tag) {
                testURLProperty(tag, 'href');
            }

            testSrcProperty('audio');
            testSrcProperty('embed');
            testSrcProperty('iframe');
            testSrcProperty('img');
            testSrcProperty('source');
            testSrcProperty('track');
            testSrcProperty('video');

            testHrefProperty('a');
            testHrefProperty('area');
            testHrefProperty('link');

            testURLProperty('object', 'data');
        });
    });


    it('should parse nested properites', function(done) {
        strStream([
            '<div itemscope>',
                '<span itemprop="outer">',
                    'Some <span itemprop="inner">random</span> data',
                '</span>',
            '</div>'
        ].join('')).pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                outer: ['Some random data'],
                inner: ['random']
            }
        }, done);
    });

    it('should parse nested scopes', function(done) {
        strStream([
            '<div itemscope>',
                '<div itemscope itemprop="nested">',
                    '<div itemprop="property">Value</div>',
                '</div>',
            '</div>'
        ].join('')).pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                nested: [{
                    properties: {
                        property: ['Value']
                    }
                }]
            }
        }, done);
    });

    it('should parse multiple nested scopes of the same name', function(done) {
        strStream([
            '<div itemscope>',
                '<div itemscope itemprop="nested">',
                    '<span itemprop="property">first</span>',
                '</div>',
                '<div itemscope itemprop="nested">',
                    '<span itemprop="property">second</span>',
                '</div>',
            '</div>'
        ].join('')).pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                nested: [
                    {
                        properties: {
                            property: ['first']
                        }
                    },
                    {
                        properties: {
                            property: ['second']
                        }
                    }
                ]
            }
        }, done);
    });

    it('should not emit nested scopes', function(done) {
        strStream([
            '<div itemscope>',
                '<div itemscope itemprop="nested">',
                    '<div itemprop="property">Value</div>',
                '</div>',
            '</div>'
        ].join('')).pipe(this.stream);

        expect(this.stream).not.to.emitItem({
            properties: {
                property: 'Value'
            }
        }, done);
    });

    describe('itemref parsing', function() {
        it('should recongnize referenced subtrees below item', function(done) {
            strStream([
                '<div itemscope itemref="a"></div>',

                '<div id="a">',
                    '<span itemprop="property">value</span>',
                '</div>'
            ].join('')).pipe(this.stream);

            expect(this.stream).to.emitItem({
                properties: {
                    property: ['value']
                }
            }, done);

        });

        it('should recognize referenced subtrees above item', function(done) {
            strStream([
                '<div id="a">',
                    '<span itemprop="property">value</span>',
                '</div>',


                '<div itemscope itemref="a"></div>',
            ].join('')).pipe(this.stream);

            expect(this.stream).to.emitItem({
                properties: {
                    property: ['value']
                }
            }, done);

        });

        it('should recongize referenced subtrees with itemprop', function(done) {
            strStream([
                '<span id="a" itemprop="property">value</span>',
                '<div itemscope itemref="a"></div>'
            ].join('')).pipe(this.stream);

            expect(this.stream).to.emitItem({
                properties: {
                    property: ['value']
                }
            }, done);
        });

        it('should recongnize multiple itemref declarations', function(done) {
            strStream([
                '<span id="a" itemprop="first">1</span>',
                '<div itemscope itemref="a b"></div>',
                '<span id="b" itemprop="second">2</span>'
            ].join('')).pipe(this.stream);

            expect(this.stream).to.emitItem({
                properties: {
                    first: ['1'],
                    second: ['2']
                }
            }, done);
        });

        it('should report multiple properties of the same name in order of defintion', function(done) {
            strStream([
                '<span id="a" itemprop="property">1</span>',
                '<span id="b" itemprop="property">2</span>',
                '<div itemscope itemref="a b c">',
                    '<span itemprop="property">3</span>',
                '</div>',
                '<span id="c" itemprop="property">4</span>'
            ].join('')).pipe(this.stream);

            expect(this.stream).to.emitItem({
                properties: {
                    property: ['1', '2', '3', '4']
                }
            }, done);
        });
    });
});
