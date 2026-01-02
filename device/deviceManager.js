// device/deviceManager.js

import deviceStore from './deviceStore.js';
import bleService from '../utils/bleService.js';

class DeviceManager {
    /**
     * 获取用于渲染的设备列表
     */
    getAllDevices() {
        return deviceStore.getList();
    }

    /**
     * 检查设备是否已存在 (用于配网过滤)
     */
    checkDeviceExists(deviceId) {
        return deviceStore.has(deviceId);
    }

    /**
     * 业务动作：添加新设备
     * 场景：配网成功后调用
     */
    addNewDevice(deviceInfo) {
        const newDevice = {
            ...deviceInfo,
            status: 0,        // 默认关
            connected: true,  // 刚配网完是连着的
            addTime: Date.now()
        };

        // 2. 存入 Store
        deviceStore.addOrUpdate(newDevice);
        return newDevice;
    }

    /**
     * 业务动作：删除设备
     * 场景：首页长按删除
     */
    async removeDevice(deviceId) {

        const device = deviceStore.getById(deviceId); // 获取设备

        if (device && device.connected) {
            // 如果链接，则断开
            bleService.disconnect(); 
        }
        const success = deviceStore.remove(deviceId);
        return success;
    }

    /**
     * 更新设备名称
     */
    updateDeviceName(deviceId, newName) {
        if (!newName || !deviceId) return;
        deviceStore.patch(deviceId, {
            name: newName
        });
    }
    /**
     * 业务动作：切换开关
     * 场景：首页点击开关
     */
    async toggleDeviceSwitch(deviceId) {
        const device = deviceStore.getById(deviceId);
        if (!device) {
            return;
        }

        const newStatus = device.status === 1 ? 0 : 1;

        // 更新本地数据
        deviceStore.patch(deviceId, {
            status: newStatus
        });

        // 发送蓝牙数据
        // 下面代码先留空
        return;
        if (device.connected) {
            
            try {
                // 假设你的协议：OpCode 0x01 (灯控), CMD 0x30, sub 0x01
                const payload = [0x30, 0x01, newStatus];
                
                // 这里需要你在 ProtocolHelper/bleService 里有对应的发送逻辑
                // await protocol.send(0x01, payload); 
                console.log(`[Manager] 发送开关指令: ${newStatus}`);
            } catch (e) {
                console.error('发送控制指令失败', e);
                // 发送失败可能需要把状态回滚，或者提示用户
            }
        } else {
            // 如果设备离线，可以选择：
            // A. 仅更新本地状态（假装成功）
            // B. 提示用户“设备未连接”
            wx.showToast({
                title: '设备未连接',
                icon: 'none'
            });
        }
    }

    /**
     * 系统动作：更新连接状态
     * 场景：蓝牙断开/连接的回调中调用
     */
    updateConnectionState(deviceId, isConnected) {
        deviceStore.setRuntimeState(deviceId, {
            connected: isConnected
        });
    }
}

// 导出单例
export default new DeviceManager();