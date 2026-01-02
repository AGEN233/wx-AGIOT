// pages/addDevice/addDevice.js
import bleService from '../../utils/bleService.js';
import bleHandle from '../../utils/ble_iot_handle.js';
import deviceManager from '../../device/deviceManager.js'; 
const deviceConfig = require('../../config/device.js');

Page({
    data: {
        isScanning: false,
        searchText: '',
        allDevices: [],    // 扫描到的源数据
        showDevices: [],   // 经过搜索过滤后的展示数据
    },

    onLoad() {
        this.initBluetooth();
    },

    onUnload() {
        // 页面卸载时清理：停止扫描、断开连接
        this.stopScan();
        bleService.disconnect();
    },

    // ==========================================
    // UI 交互逻辑 (搜索、输入)
    // ==========================================

    onSearchInput(e) {
        this.setData({
            searchText: e.detail.value
        });
        this.filterDevices();
    },

    onSearchConfirm(e) {
        this.setData({
            searchText: e.detail.value
        });
        this.filterDevices();
    },

    onClearInput() {
        this.setData({
            searchText: ''
        });
        this.filterDevices();
    },
    
    /**
     * 本地过滤搜索结果
     */
    filterDevices() {
        const key = this.data.searchText.toUpperCase();
        const list = this.data.allDevices;

        if (!key) {
            this.setData({
                showDevices: list
            });
        } else {
            const filtered = list.filter((device) => {
                const name = (device.name || '').toUpperCase();
                const mac = (device.deviceId || '').toUpperCase();
                return name.includes(key) || mac.includes(key);
            });
            this.setData({
                showDevices: filtered
            });
        }
    },

    initBluetooth() {
        wx.openBluetoothAdapter({
            success: () => {
                this.startScan();
            },
            fail: (err) => {
                wx.showModal({
                    title: '提示',
                    content: '请开启手机蓝牙',
                    showCancel: false
                });
            }
        });
    },

    startScan() {
        if (this.data.isScanning) {
            return;
        }
        this.setData({
            isScanning: true
        });

        // 监听发现新设备
        wx.onBluetoothDeviceFound((res) => {
            res.devices.forEach((device) => {
                this.ble_iot_scanf_check(device);
            });
        });

        wx.startBluetoothDevicesDiscovery({
            allowDuplicatesKey: true,
            interval: 0
        });
    },

    stopScan() {
        wx.stopBluetoothDevicesDiscovery();
        this.setData({
            isScanning: false
        });
    },

    /**
     * 扫描数据校验与处理
     */
    ble_iot_scanf_check(newDevice) {
        // 1. 校验配置文件
        if (!deviceConfig || !deviceConfig.company_id) {
            return;
        }

        const buffer = newDevice.advertisData;
        if (!buffer) {
            return;
        }
        const dataBytes = new Uint8Array(buffer);
        if (dataBytes.length < 3) {
            return;
        }
        if (dataBytes[0] != deviceConfig.company_id[0] || dataBytes[1] != deviceConfig.company_id[1]) {
            return;
        }
        const device_type = dataBytes[2];
        const matchInfo = deviceConfig.types[device_type];
        if (matchInfo) {
            newDevice.customType = matchInfo.name;
            newDevice.customIcon = matchInfo.icon;
        } else {
            newDevice.customType = '未知设备';
        }

        // 使用 Manager 检查是否已存在
        if (deviceManager.checkDeviceExists(newDevice.deviceId)) {
            return;
        }

        let pool = this.data.allDevices;
        const idx = pool.findIndex((d) => d.deviceId === newDevice.deviceId);
        if (idx !== -1) {
            pool[idx].RSSI = newDevice.RSSI;
        } else {
            pool.push(newDevice);
        }
        pool.sort((a, b) => b.RSSI - a.RSSI);

        this.setData({
            allDevices: pool
        });
        
        this.filterDevices();
    },

    /**
    * 配网按钮
    */
    async ble_iot_onconnect(e) {
        const deviceId = e.currentTarget.dataset.id;
        
        // 防御性判断
        if (!deviceId) return;

        this.stopScan();
        wx.showLoading({
            title: '添加设备中'
        });

        try {
            const ret = await bleHandle.ble_iot_add_device(deviceId);
            this.handleConnectSuccess(deviceId, ret);

        } catch (err) {
            console.error('配网失败:', err);
            wx.hideLoading();

            let msg = err.message || '连接失败';
            if (msg.includes('10003')) {
                msg = '蓝牙连接断开，请重试';
            }

            wx.showModal({
                title: '配网失败',
                content: msg,
                showCancel: false,
                confirmText: '重试'
            });

            // 失败时务必断开，重置状态
            bleService.disconnect();
        }
    },

    /**
     * 配网成功后续处理：入库、返回
     */
    handleConnectSuccess(deviceId, resultInfo) {
        wx.hideLoading();
        wx.showToast({
            title: '添加成功',
            icon: 'success'
        });

        const scannedInfo = this.data.allDevices.find((d) => d.deviceId === deviceId);
        
        let finalName = '智能设备';
        if (scannedInfo) {
            finalName = scannedInfo.name || scannedInfo.localName || scannedInfo.customType || '智能设备';
        }

        const newDevice = {
            deviceId: deviceId,
            name: finalName,
            type: resultInfo.deviceType,
            fwVersion: resultInfo.fwVersion,
            icon: scannedInfo ? scannedInfo.customIcon : ''
        };

        // 更新到本地
        deviceManager.addNewDevice(newDevice);
        
        setTimeout(() => {
            wx.navigateBack();
        }, 1500);
    }
});