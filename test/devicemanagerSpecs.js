"use strict";
/* jshint -W024 */
/* jshint -W079 */
/* jshint expr:true */

let chai = require('chai');
let mockery = require('mockery');
let sinon = require('sinon');
let sinonChai = require("sinon-chai");
let expect = chai.expect;
chai.use(sinonChai);

describe('devicemanager', function () {
    let sut, ssdpFake, eventCallbacks;
    beforeEach(function () {
        eventCallbacks = {};
        ssdpFake = {
            mSearch: sinon.spy(),
            on: function(st, callback) {
                eventCallbacks[st] = callback;
            }
        };
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
        mockery.registerMock('./logger.js', { stream: sinon.spy(), info: sinon.spy(), warn: sinon.spy(), debug: sinon.spy(), error: sinon.spy() });
        mockery.registerMock('node-upnp-ssdp', ssdpFake);
        sut = require('../devicemanager.js');
    });
    afterEach(function () {
        mockery.deregisterAll();
        mockery.disable();
    });
    it('Should perform an M-SEARCH for openhome products', function () {
        expect(ssdpFake.mSearch).to.have.been.calledWith('urn:av-openhome-org:service:Product:1');
    });
    describe('when a device becomes available', function () {
        beforeEach(function (done) {
            let nock = require('nock');
            let data = require('./data/deviceXmlData');
            let discoveredDevice = require('./data/discoveredDevice.json');
            nock('http://192.168.1.136:55178')
                .get('/Ds/device.xml')
                .reply(200, data.device);
            nock('http://192.168.1.136:55178')
                .post('/Ds/Product/control')
                .reply(200, data.sources);
            let cb = eventCallbacks['DeviceAvailable:urn:av-openhome-org:service:Playlist:1'];

            cb(discoveredDevice);

            let interval = setInterval(function() {
                if (sut.getDevice('4c494e4e-0026-0f21-cc9a-01320147013f')) {
                    clearInterval(interval);
                    done();
                }
            },50);
        });
        describe('and getting a specific device', function () {
            let result;
            beforeEach(function () {
                result = sut.getDevice('4c494e4e-0026-0f21-cc9a-01320147013f');
            });
            it('Should return the expected device', function () {
                expect(result).to.contain.all.keys('ds', 'icon', 'name', 'sourceList', 'urlRoot');
            });
            it('DS should exist', function () {
                expect(result.ds).to.exist;
            });
            it('Icon should be correct', function (){
                expect(result.icon).to.be.eql({
                    "depth": "32",
                    "height": "50",
                    "mimetype": "image/png",
                    "url": "http://192.168.1.136/images/Icon.png",
                    "width": "120"
                });
            });
            it('Name should be correct', function () {
                expect(result.name).to.be.eql('Living Room:Majik DSM');
            });
            it('Source list should be correct', function () {
                let expectedSourceList = require('./data/expectedSourceList.json');
                expect(result.sourceList).to.be.eql(expectedSourceList);
            });
            it('URLRoot should be correct', function () {
                expect(result.urlRoot).to.be.eql('http://192.168.1.136:55178/Ds/device.xml');
            });
            describe('and then becomes unavailable', function () {
                beforeEach(function (done) {
                    let discoveredDevice = require('./data/discoveredDevice.json');
                    let cb = eventCallbacks["DeviceUnavailable:urn:av-openhome-org:service:Playlist:1"];
                    cb(discoveredDevice);

                    let interval = setInterval(function() {
                        if (!sut.getDevice('4c494e4e-0026-0f21-cc9a-01320147013f')) {
                            clearInterval(interval);
                            done();
                        }
                    },50);
                });
                describe('When getting the device', function () {
                    beforeEach(function () {
                        result = sut.getDevice('4c494e4e-0026-0f21-cc9a-01320147013f');
                    });
                    it('It should no longer be there', function () {
                        expect(result).to.be.undefined;
                    });
                })
            });
        });
    });
});