// utils/ProtocolHelper.js
const deviceConfig = require('../config/device.js');

const HEAD1 = 0xA0;
const HEAD2 = 0x0B;
const VER = 0x00;

class ProtocolHelper {
  constructor() { this.sn = 0; }
  
  // 序列号自增
  _getNextSN() { this.sn = (this.sn + 1) & 0xFF; return this.sn; }

  /**
   * [Row 23] 构建添加设备请求
   * 结构: AppVerH(1) + AppVerL(1) + RFU(1) + RFU(1)
   */
  buildAddDeviceFrame() {
    const buffer = new ArrayBuffer(4); // Payload共4字节
    const view = new DataView(buffer);

    // 1. 读取配置版本号 (如 1.0 -> 0x01 0x00)
    const appVer = deviceConfig.app_version || [0x01, 0x00];
    view.setUint8(0, appVer[0]); 
    view.setUint8(1, appVer[1]);

    // 2. 填充 RFU (固定 0x00)
    view.setUint8(2, 0x00);
    view.setUint8(3, 0x00);

    // OpCode=0x00, CMD=0x41, sub=0x01
    return this._buildFrame(0x00, 0x41, 0x01, buffer);
  }

  /**
   * [Row 25] 构建登录/握手请求
   * 结构: Timestamp(4)
   */
  buildLoginFrame() {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);

    // 填入秒级时间戳 (用于设备校时)
    const timestamp = Math.floor(Date.now() / 1000);
    view.setUint32(0, timestamp, false); // Big-Endian

    // OpCode=0x00, CMD=0x4C, sub=0x01
    return this._buildFrame(0x00, 0x4C, 0x01, buffer);
  }

  // --- 通用组包 (保持不变) ---
  _buildFrame(opCode, cmd, subCmd, dataBuffer) {
    const dataBytes = new Uint8Array(dataBuffer || []);
    const payloadLen = 1 + 1 + dataBytes.length; 
    const totalLen = 7 + payloadLen + 1;

    const buffer = new ArrayBuffer(totalLen);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let idx = 0;

    view.setUint8(idx++, HEAD1);
    view.setUint8(idx++, HEAD2);
    view.setUint8(idx++, VER);
    view.setUint8(idx++, this._getNextSN());
    view.setUint8(idx++, opCode);
    view.setUint16(idx, payloadLen, false); // Big-Endian
    idx += 2;
    view.setUint8(idx++, cmd);
    view.setUint8(idx++, subCmd);
    if(dataBytes.length > 0) {
        bytes.set(dataBytes, idx);
        idx += dataBytes.length;
    }
    let sum = 0;
    for(let i=0; i<idx; i++) sum += bytes[i];
    view.setUint8(idx, sum & 0xFF);

    return buffer;
  }

  // --- 通用解包 (保持不变) ---
  parseFrame(buffer) {
    if(buffer.byteLength < 10) return null;
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    if(bytes[0] !== HEAD1 || bytes[1] !== HEAD2) return null;
    const len = view.getUint16(5, false);
    if(bytes.length < 7 + len + 1) return null;
    let sum = 0;
    for(let i=0; i< 7+len; i++) sum += bytes[i];
    if((sum & 0xFF) !== bytes[7+len]) return null;
    return {
        opCode: bytes[4],
        cmd: bytes[7],
        subCmd: bytes[8],
        data: buffer.slice(9, 9 + (len-2))
    };
  }
}
module.exports = new ProtocolHelper();