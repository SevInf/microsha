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

    it('should use content attribute of a <meta> tag as value', function(done) {
        strStream([
            '<div itemscope>',
                '<meta itemprop="property" content="value" />',
            '</div>'
        ].join('')).pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                property: ['value']
            }
        }, done);
    });

    it('should use empty string if "content" is not specified on <meta>', function(done) {
        strStream([
            '<div itemscope>',
                '<meta itemprop="property" />',
            '</div>'
        ].join('')).pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                property: ['']
            }
        }, done);
    });

    describe('URL properties', function() {
        function testURLProperty(tag, attr) {
            it('should "'+ attr + '" attribute of <' + tag + '> tag as value', function(done) {
                strStream([
                    '<div itemscope>',
                        '<', tag, ' itemprop="property" ', attr, '="http://example.com/">Ignore</', tag, '>',
                    '</div>'
                ].join('')).pipe(this.stream);

                expect(this.stream).to.emitItem({
                    properties: {
                        property: ['http://example.com/']
                    }
                }, done);
            });

            it('should use empty string if "' + attr + '" is not specified on <' + tag + '>' , function(done) {
                strStream([
                    '<div itemscope>',
                        '<', tag, ' itemprop="property">Ignore</', tag, '>',
                    '</div>'
                ].join('')).pipe(this.stream);

                expect(this.stream).to.emitItem({
                    properties: {
                        property: ['']
                    }
                }, done);
            });

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

});
