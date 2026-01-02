// utils/bleService.js
import protocol from './ble_protocol.js';


const SERVICE_UUID = '00004300-0000-1000-8000-00805F9B34FB';
const WRITE_CHAR_UUID = '00004301-0000-1000-8000-00805F9B34FB';
const NOTIFY_CHAR_UUID = '00004302-0000-1000-8000-00805F9B34FB';

let _connectedDeviceId = null;
let _isConnected = false;
let _isConnecting = false;

let _globalDataCallback = null; // 低优先级：平时用
let _occupiedDataCallback = null; // 高优先级：配网步骤用

function _wxPromisify(fn, obj) {
    return new Promise((resolve, reject) => {
        obj.success = resolve;
        obj.fail = (err) => {
            reject(new Error(err.errMsg));
        };
        fn(obj);
    });
}

function initListeners() {
    wx.onBLECharacteristicValueChange((res) => {
        const parsed = protocol.parseFrame(res.value);
        if (!parsed) {
            return;
        }

        if (_occupiedDataCallback) {
            _occupiedDataCallback(parsed);
            return;
        }


        if (_globalDataCallback) {
            // 如果没人占用，才分发给全局回调
            _globalDataCallback(parsed);
        }
    });

    wx.onBLEConnectionStateChange((res) => {
        _isConnected = res.connected;
        if (!res.connected) {
            _connectedDeviceId = null;
            _occupiedDataCallback = null;
        }
    });
}

/**
 * 设置全局统一回调 (低优先级)
 * 例如：用于打印日志、更新首页状态
 */
function setGlobalDataCallback(cb) {
    _globalDataCallback = cb;
}

/**
 * 临时占用回调 (高优先级)
 * 例如：用于 sendAndAwaitStep，配网完记得传 null 释放
 */
function occupyDataCallback(cb) {
    _occupiedDataCallback = cb;
}

async function connectPhy(deviceId) {
    if (_isConnecting) {
        throw new Error('Busy');
    }
    if (_isConnected && _connectedDeviceId === deviceId) {
        return;
    }
    if (_isConnected) {
        disconnect();
    }

    _isConnecting = true;
    try {
        await _wxPromisify(wx.createBLEConnection, {
            deviceId
        });
        
        // MTU协商
        try {
            const mtuRes = await _wxPromisify(wx.setBLEMTU, {
                deviceId,
                mtu: 512
            });
            console.log('MTU 协商成功，当前值:', mtuRes.mtu);
        } catch (mtuError) {
            console.warn('MTU 协商失败或系统不支持，跳过继续:', mtuError);
        }
        await new Promise((r) => {
            setTimeout(r, 200);
        });

        await _wxPromisify(wx.getBLEDeviceServices, {
            deviceId
        });

        await _wxPromisify(wx.getBLEDeviceCharacteristics, {
            deviceId,
            serviceId: SERVICE_UUID
        });

        await _wxPromisify(wx.notifyBLECharacteristicValueChange, {
            deviceId,
            serviceId: SERVICE_UUID,
            characteristicId: NOTIFY_CHAR_UUID,
            state: true
        });

        _isConnected = true;
        _connectedDeviceId = deviceId;
    } catch (e) {
        disconnect();
        throw e;
    } finally {
        _isConnecting = false;
    }
}

async function write(buffer) {
    if (!_isConnected) {
        throw new Error('No Connection');
    }
    return _wxPromisify(wx.writeBLECharacteristicValue, {
        deviceId: _connectedDeviceId,
        serviceId: SERVICE_UUID,
        characteristicId: WRITE_CHAR_UUID,
        value: buffer
    });
}

function disconnect() {
    if (_connectedDeviceId) {
        wx.closeBLEConnection({
            deviceId: _connectedDeviceId
        });
    }
    _isConnected = false;
    _isConnecting = false;
    _connectedDeviceId = null;
    _occupiedDataCallback = null; // 释放占用
    // 注意：这里没有清空 GlobalCallback，因为全局监听通常希望一直活着
}

initListeners();

export default {
    connectPhy,
    write,
    disconnect,
    setGlobalDataCallback, // 注册全局的
    occupyDataCallback, // 注册占用的
    getIsConnected: () => {
        return _isConnected;
    }
};