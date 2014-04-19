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
                spy.called? spy.firstCall.args[0] : 'nothing'
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

    it('should report parse item properties', function(done) {
        strStream('<div itemscope><div itemprop="property">Value</div></div>')
            .pipe(this.stream);

        expect(this.stream).to.emitItem({
            properties: {
                property: ['Value']
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
