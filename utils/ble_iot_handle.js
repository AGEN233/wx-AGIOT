import device from '../config/device.js';
import protocol from './ble_protocol.js';
import bleService from './bleService.js';

const PROVISION_TIMEOUT = 3000;

/**
 * 【辅助工具】字符串转 UTF-8 字节数组
 */
function stringToBytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i);
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0xd800 || code >= 0xe000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
            i++;
            code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return bytes;
}

/**
 * 发送并等待
 * @param {Number} opCode - 如 0x00
 * @param {Array} fullPayload - [CMD, subCMD, ...Data]
 * @param {Number} expectCmd16 - 期望的 16位指令 (如 0x4102)
 */
function _sendAndAwaitStep(opCode, fullPayload, expectCmd16) {
    return new Promise((resolve, reject) => {
        let isDone = false;
        let timer = null;

        const stepHandler = (parsed) => {
            if (parsed.opCode === opCode && parsed.cmd === expectCmd16) {
                isDone = true;
                if (timer) clearTimeout(timer);
                bleService.occupyDataCallback(null);
                resolve(parsed.data); 
            }
        };
        bleService.occupyDataCallback(stepHandler);

        timer = setTimeout(() => {
            if (!isDone) {
                bleService.occupyDataCallback(null);
                reject(new Error(`超时: 等待 CMD 0x${expectCmd16.toString(16)}`));
            }
        }, PROVISION_TIMEOUT);
        try {
            if (opCode == 0x00) {
                protocol.ble_iot_send(opCode, fullPayload)
            }
        } catch (err) {
            if (timer) clearTimeout(timer);
            bleService.occupyDataCallback(null);
            reject(err);
        }
    });
}

/**
 * 添加设备流程
 */
async function ble_iot_add_device(deviceId) {
    await bleService.connectPhy(deviceId);
    const data = [0x41, 0x01, device.app_version[0], device.app_version[1], 0x00, 0x00];
    const adPayload = await _sendAndAwaitStep(0x00, data, 0x4102);
    if (adPayload[0] !== 0x01) {
        throw new Error(`设备拒绝添加 (Code: ${adPayload[0]})`);
    }
    const DeviceType = adPayload[1];
    const FwVersion = (adPayload[2] << 8) | adPayload[3];
    return {
        success: true,
        DeviceType: DeviceType,
        FwVersion: FwVersion,
    };
}

// 导出接口
export default {
    ble_iot_add_device
};