// utils/bleService.js
import protocol from './ProtocolHelper';

const SERVICE_UUID = '00004300-0000-1000-8000-00805F9B34FB';
const WRITE_CHAR_UUID = '00004301-0000-1000-8000-00805F9B34FB';
const NOTIFY_CHAR_UUID = '00004302-0000-1000-8000-00805F9B34FB';

const TIMEOUT_CMD = 3000; 

class BleService {
  constructor() {
    this.connectedDeviceId = null;
    this.isConnected = false;
    this.isConnecting = false;
    this._taskResolve = null;
    this._taskReject = null;
    this._taskTimer = null;
    this._initListeners();
  }

  // ==========================================
  // 1. 添加设备 [Row 23 & 24]
  // ==========================================
  async addDevice(deviceId) {
    console.log(`[BleService] Add Device: ${deviceId}`);
    await this._connectPhy(deviceId);

    try {
      // 1. 构建请求 (带AppVer和RFU)
      const frame = protocol.buildAddDeviceFrame();
      
      // 2. 发送并等待回复 (Expect: CMD 0x41, sub 0x02)
      const resData = await this._sendAndWait(frame, 0x41, 0x02);
      
      // 3. 解析回复 [Row 24]
      // Payload: Result(1) + DeviceType(1) + FwVerH(1) + FwVerL(1)
      const view = new DataView(resData);
      const result = view.getUint8(0); 

      // 0x01: 允许添加; 0x02: 不能添加
      if (result !== 0x01) {
        throw new Error(`设备拒绝添加(0x${result.toString(16)})`);
      }

      const type = view.getUint8(1);
      const ver = `${view.getUint8(2)}.${view.getUint8(3)}`;
      
      console.log(`[BleService] 配对成功! Type:${type}, Ver:${ver}`);
      return { deviceId, type, version: ver };

    } catch (e) {
      console.error(e);
      this.disconnect();
      throw e;
    }
  }

  // ==========================================
  // 2. 日常登录/握手 [Row 25 & 26]
  // ==========================================
  async loginDevice(deviceId) {
    console.log(`[BleService] Login Device: ${deviceId}`);
    
    if (!this.isConnected || this.connectedDeviceId !== deviceId) {
       await this._connectPhy(deviceId);
    }

    try {
      // 1. 构建请求 (带时间戳)
      const frame = protocol.buildLoginFrame();

      // 2. 发送并等待回复 (Expect: CMD 0x4C, sub 0x02)
      const resData = await this._sendAndWait(frame, 0x4C, 0x02);

      // 3. 解析回复 [Row 26]
      // Payload: Result(1) + RFU(1) + RFU(1) + RFU(1)
      const view = new DataView(resData);
      const result = view.getUint8(0); 

      // 0x00: 成功; 0x01: 失败
      if (result !== 0x00) {
        throw new Error('握手失败');
      }

      console.log(`[BleService] 登录/校时成功`);
      return true;

    } catch (e) {
      console.error(e);
      this.disconnect();
      throw e;
    }
  }

  // ==========================================
  // 基础功能 (保持稳定逻辑)
  // ==========================================
  
  _sendAndWait(buffer, cmd, subCmd) {
    return new Promise((resolve, reject) => {
      this._taskResolve = (parsed) => {
        if (parsed.cmd === cmd && parsed.subCmd === subCmd) {
          resolve(parsed.data);
          return true;
        }
        return false;
      };
      this._taskReject = reject;
      this._taskTimer = setTimeout(() => {
        reject(new Error('指令超时'));
        this._clearTask();
      }, TIMEOUT_CMD);

      this.write(buffer).catch(err => {
        reject(err);
        this._clearTask();
      });
    });
  }

  async _connectPhy(deviceId) {
    if (this.isConnecting) throw new Error('Busy');
    if (this.isConnected && this.connectedDeviceId === deviceId) return;
    if (this.isConnected) this.disconnect();

    this.isConnecting = true;
    try {
      await this._wxPromisify(wx.createBLEConnection, { deviceId });
      await new Promise(r => setTimeout(r, 200)); 
      await this._wxPromisify(wx.getBLEDeviceServices, { deviceId });
      await this._wxPromisify(wx.getBLEDeviceCharacteristics, { deviceId, serviceId: SERVICE_UUID });
      await this._wxPromisify(wx.notifyBLECharacteristicValueChange, {
        deviceId, serviceId: SERVICE_UUID, characteristicId: NOTIFY_CHAR_UUID, state: true
      });
      this.isConnected = true;
      this.connectedDeviceId = deviceId;
    } catch (e) {
      this.disconnect();
      throw e;
    } finally {
      this.isConnecting = false;
    }
  }

  async write(buffer) {
    if (!this.isConnected) throw new Error('No Connection');
    return this._wxPromisify(wx.writeBLECharacteristicValue, {
      deviceId: this.connectedDeviceId,
      serviceId: SERVICE_UUID,
      characteristicId: WRITE_CHAR_UUID,
      value: buffer
    });
  }

  disconnect() {
    if (this.connectedDeviceId) wx.closeBLEConnection({ deviceId: this.connectedDeviceId });
    this.isConnected = false;
    this.isConnecting = false;
    this._clearTask();
  }

  _initListeners() {
    wx.onBLECharacteristicValueChange((res) => {
      const parsed = protocol.parseFrame(res.value);
      if (!parsed) return;
      if (this._taskResolve && this._taskResolve(parsed)) {
        this._clearTask();
      }
    });
    wx.onBLEConnectionStateChange((res) => {
      this.isConnected = res.connected;
      if (!res.connected) {
        if (this._taskReject) this._taskReject(new Error('断开连接'));
        this._clearTask();
        this.connectedDeviceId = null;
      }
    });
  }

  _clearTask() {
    this._taskResolve = null;
    this._taskReject = null;
    if (this._taskTimer) clearTimeout(this._taskTimer);
  }

  _wxPromisify(fn, obj) {
    return new Promise((resolve, reject) => {
      obj.success = resolve;
      obj.fail = (err) => reject(new Error(err.errMsg));
      fn(obj);
    });
  }
}

module.exports = new BleService();