"use strict";

let ssdp = require("node-upnp-ssdp");
let http = require('http');
let _ = require('underscore');
let url = require('url');
let Ds = require('./ds.js').Ds;
let responseParser = require('parsexmlresponse');
let logger = require('./logger.js');

let devices = new Map();

const searchType = 'urn:av-openhome-org:service:Product:1';

let parseUuid = usn => (/uuid:(.*)?::.*/).exec(usn)[1];

function processServiceListArray(serviceList) {
    return _.reduce(serviceList, (memo, item) => {
        memo[item.serviceType] = {
            serviceId: item.serviceId,
            scpdurl: item.SCPDURL,
            controlUrl: item.controlURL,
            eventSubUrl: item.eventSubURL
        };
        return memo;
    }, {});
}

function fetchIcon(icon) {
    let iconArray = _.isArray(icon) ? icon : [icon];
    return _.chain(iconArray)
        .reject(item => item.height > 50)
        .first()
        .value();
}

function toDeviceUsingLocation(location, callback) {
    return function toDevice(err, result) {
        let ds = new Ds(location, processServiceListArray(result.root.device.serviceList.service));
        logger.debug('Getting sources at '+location);
        ds.getSources(function (err, results) {
            let device;
            if (err) {
                callback(err);
            } else {
                device = {
                    name: result.root.device.friendlyName,
                    urlRoot: location,
                    sourceList: results,
                    ds: ds
                };
                if (result.root.device.iconList) {
                    let icon = fetchIcon(result.root.device.iconList.icon);
                    device.icon = {
                        mimetype: icon.mimetype,
                        width: icon.width,
                        height: icon.height,
                        depth: icon.depth,
                        url: url.resolve(location, icon.url)
                    };
                }
                callback(null, device);
            }
        });
    };
}

function processDevice(location, callback) {
    http.get(
        location,
        responseParser(toDeviceUsingLocation(location, callback))
    ).on('error', callback);
}

exports.getDevice = function(uuid) {
    return devices.get(uuid);
};

exports.getDevices = () => { return devices.keys(); };

ssdp.on("DeviceAvailable:urn:av-openhome-org:service:Playlist:1", function onDeviceAvailable(res) {
    let uuid = parseUuid(res.usn, res.nt);
    processDevice(res.location, function makeDeviceAvailable(err, device) {
        if (err) {
            logger.warn('Problem processing device at` ' + res.location);
            logger.warn(err);
        } else {
            devices.set(uuid, device);
            logger.info("Available: " + device.name);
        }
    });
});

ssdp.on("DeviceUnavailable:urn:av-openhome-org:service:Playlist:1", function onDeviceUnavailable(res) {
    let uuid = parseUuid(res.usn, res.nt);
    if (devices.has(uuid)) {
        let device = devices.get(uuid);
        logger.info("Removing: " + device.name);
        devices.delete(uuid);
    }
});

ssdp.on("DeviceFound", function onDeviceFound(res) {
    if (res.st === searchType) {
      let uuid = parseUuid(res.usn, res.st);
      processDevice(res.location, function makeDeviceAvailable(err, device) {
        if (err) {
            logger.warn('Problem processing device at ' + res.location);
            logger.warn(err);
        } else {
            logger.info("Found: " + device.name);
        }
      });
    }
});

ssdp.mSearch(searchType);
