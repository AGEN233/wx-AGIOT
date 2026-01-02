// ble_protocol.js
import protol from '../config/bleprotocol.js';
import bleService from './bleService.js';

let g_sn = 0;
/**
 * 内部函数：序列号自增 (类似 C 的 static 函数)
 */
function _get_sn() {
    g_sn = (g_sn + 1) & 0xFF;
    return g_sn;
}

/**
 * 显式校验和计算
 */
function _calculateChecksum(buf, len) {
    let sum = 0;
    for (let i = 0; i < len; i++) {
        sum += buf[i];
    }
    return sum & 0xFF;
}

/**
 * 核心传输层封包函数：ble_iot_send
 * 结构：HEAD(4) + OP(1) + LEN(2) + PAYLOAD(N) + CS(1)
 */
function ble_iot_send(opCode, data_buf) {
    const data = data_buf instanceof ArrayBuffer ? new Uint8Array(data_buf) : new Uint8Array(data_buf || []);
    const packetSize = 8 + data.length; 
    
    const sbuf = new ArrayBuffer(packetSize);
    const sbuf_view = new Uint8Array(sbuf);

    let index = 0;

    sbuf_view[index++] = protol.Ver0.HEAD1;
    sbuf_view[index++] = protol.Ver0.HEAD2;
    sbuf_view[index++] = protol.Ver0.VER;
    sbuf_view[index++] = _get_sn();

    sbuf_view[index++] = opCode;
    sbuf_view[index++] = (data.length >> 8) & 0xFF;
    sbuf_view[index++] = data.length & 0xFF;

    sbuf_view.set(data, index);
    index += data.length;

    sbuf_view[index++] = _calculateChecksum(sbuf_view, index);
    bleService.write(sbuf);
}

/**
 * 接收数据解析
 */
function parseFrame(buffer) {
    const bytes = new Uint8Array(buffer);
    
    if (bytes.length < 8) {
        return null;
    }

    if (bytes[0] !== protol.Ver0.HEAD1 || bytes[1] !== protol.Ver0.HEAD2) {
        return null;
    }

    const sum = _calculateChecksum(bytes, bytes.length - 1);
    if (sum !== bytes[bytes.length - 1]) {
        console.error('Checksum error');
        return null;
    }

    const opCode = bytes[4];
    const payloadLen = (bytes[5] << 8) | bytes[6];
    const rawPayload = bytes.slice(7, 7 + payloadLen);
    
    if (rawPayload.length < 2) {
        return null;
    }

    const combinedCmd = (rawPayload[0] << 8) | rawPayload[1];
    return {
        opCode: opCode,
        cmd: combinedCmd,
        data: rawPayload.slice(2) 
    };
}

// --- 统一导出函数 ---
export default{
    ble_iot_send,
    parseFrame
};