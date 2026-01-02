// device/deviceStore.js

const STORAGE_KEY = 'SMART_USER_DEVICES';
class DeviceStore {
    constructor() {
        this._deviceMap = new Map();
        this._initData();
    }

    /**
     * 从本地读取到内存
     */
    _initData() {
        try {
            const list = wx.getStorageSync(STORAGE_KEY) || [];
            this._deviceMap.clear();
            list.forEach((device) => {
                if (device && device.deviceId) {
                    // 重启后默认为未连接状态
                    device.connected = false;
                    this._deviceMap.set(device.deviceId, device);
                }
            });
        } catch (e) {
            console.error('Store Init Failed:', e);
        }
    }

    /**
     * 将内存数据写入本地
     */
    _persist() {
        try {
            const list = Array.from(this._deviceMap.values());
            wx.setStorageSync(STORAGE_KEY, list);
        } catch (e) {
            console.error('Store Save Failed:', e);
        }
    }

    /**
     * 获取设备列表
     */
    getList() {
        return Array.from(this._deviceMap.values());
    }

    /**
     * 根据 ID 获取单个设备
     */
    getById(deviceId) {
        return this._deviceMap.get(deviceId);
    }

    /**
     * 检查是否存在
     */
    has(deviceId) {
        return this._deviceMap.has(deviceId);
    }

    /**
     * 新增或覆盖设备
     */
    addOrUpdate(device) {
        if (!device.deviceId) {
            return;
        }
        this._deviceMap.set(device.deviceId, device);
        this._persist();
    }

    /**
     * 局部更新属性
     * @param {String} deviceId 
     * @param {Object} partialStats (例如 { status: 1 })
     */
    patch(deviceId, partialStats) {
        const device = this._deviceMap.get(deviceId);
        if (device) {
            Object.assign(device, partialStats);
            this._deviceMap.set(deviceId, device);
            this._persist();
            return true;
        }
        return false;
    }

    /**
     * 更新运行时状态到内存
     */
    setRuntimeState(deviceId, partialStats) {
        const device = this._deviceMap.get(deviceId);
        if (device) {
            Object.assign(device, partialStats);
            this._deviceMap.set(deviceId, device);
            // 注意：这里不调用 _persist()，因为连接状态不需要存盘
        }
    }

    /**
     * 删除设备
     */
    remove(deviceId) {
        if (this._deviceMap.has(deviceId)) {
            this._deviceMap.delete(deviceId);
            this._persist();
            return true;
        }
        return false;
    }
}

// 导出单例
export default new DeviceStore();