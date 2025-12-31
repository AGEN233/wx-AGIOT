// pages/addDevice/addDevice.js
// 引入封装好的蓝牙服务
import bleService from '../../utils/bleService';
const deviceConfig = require('../../config/device.js');

const ADDED_DEVICE_IDS_KEY = 'ADDED_DEVICE_IDS';
const USER_DEVICES_KEY = 'SMART_USER_DEVICES';

/**
 * 从本地缓存同步获取已添加设备的ID列表
 */
function getAddedDeviceIds() {
    try {
        const ids = wx.getStorageSync(ADDED_DEVICE_IDS_KEY);
        return Array.isArray(ids) ? ids : [];
    } catch (e) {
        console.error('获取已添加设备ID失败', e);
        return [];
    }
}

Page({
    data: {
        isScanning: false, // 扫描状态
        searchText: '',    // 搜索框内容
        allDevices: [],    // 所有通过厂商ID过滤的设备
        showDevices: [],   // 界面上显示的设备（经过搜索过滤）
        addedDeviceIds: [],// 已添加的设备ID列表（用于搜索过滤）
    },

    onLoad() {
        this.setData({
            addedDeviceIds: getAddedDeviceIds()
        });

        this.initBluetooth();
    },

    onUnload() {
        this.stopScan();
        // 注意：这里不要关闭适配器，因为 bleService 可能还在后台跑，
        // 或者直接调用 disconnect 确保断开连接
        bleService.disconnect(); 
        // 只有确信退出整个蓝牙功能时才 closeAdapter，通常建议在 app.js 或用户手动关闭时处理
        // wx.closeBluetoothAdapter(); 
    },

    // =========================================================
    // 搜索框交互逻辑 (保持不变)
    // =========================================================
    onSearchInput(e) {
        this.setData({ searchText: e.detail.value });
        this.filterDevices();
    },
    onSearchConfirm(e) {
        this.setData({ searchText: e.detail.value });
        this.filterDevices();
    },
    onClearInput() {
        this.setData({ searchText: '' });
        this.filterDevices();
    },

    filterDevices() {
        const key = this.data.searchText.toUpperCase();
        const list = this.data.allDevices;

        if (!key) {
            this.setData({ showDevices: list });
        } else {
            const filtered = list.filter(device => {
                const name = (device.name || '').toUpperCase();
                const mac = (device.deviceId || '').toUpperCase();
                return name.includes(key) || mac.includes(key);
            });
            this.setData({ showDevices: filtered });
        }
    },

    // =========================================================
    // 蓝牙初始化与扫描 (保持不变，UI层负责扫描发现)
    // =========================================================
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
        if (this.data.isScanning) return;
        this.setData({ isScanning: true });

        wx.onBluetoothDeviceFound((res) => {
            res.devices.forEach(device => {
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
        this.setData({ isScanning: false });
    },

    // 扫描过滤逻辑
    ble_iot_scanf_check(newDevice) {
        // 1. 厂商ID检查
        if (!deviceConfig || !deviceConfig.company_id) return;
        
        const buffer = newDevice.advertisData;
        if (!buffer) return;
        
        const dataBytes = new Uint8Array(buffer);
        if (dataBytes.length < 3) return;
        
        // 匹配前两个字节
        if (dataBytes[0] != deviceConfig.company_id[0] && dataBytes[1] != deviceConfig.company_id[1]) {
            return;
        }

        // 2. 解析设备类型和图标 (UI显示用)
        const device_type = dataBytes[2];
        const matchInfo = deviceConfig.types[device_type];
        if (matchInfo) {
            newDevice.customType = matchInfo.name;
            newDevice.customIcon = matchInfo.icon;
        }

        // 3. 过滤已添加设备
        if (this.data.addedDeviceIds.includes(newDevice.deviceId)) return;

        // 4. 更新列表 (去重 + 更新RSSI)
        let pool = this.data.allDevices;
        const idx = pool.findIndex(d => d.deviceId === newDevice.deviceId);

        if (idx !== -1) {
            pool[idx].RSSI = newDevice.RSSI;
        } else {
            pool.push(newDevice);
        }

        pool.sort((a, b) => b.RSSI - a.RSSI);
        this.ble_iot_scanf_updataUI(pool);
    },

    ble_iot_scanf_updataUI(pool) {
        this.setData({ allDevices: pool });
        this.filterDevices();
    },

    // =========================================================
    // 点击连接逻辑 (核心修改部分)
    // =========================================================
    async ble_iot_onconnect(e) {
        const deviceId = e.currentTarget.dataset.id;
        
        // 1. 停止扫描，准备连接
        this.stopScan();

        wx.showLoading({ title: '设备配对中...' });
        wx.vibrateShort({ type: 'medium' });

        try {
            // 2. 调用 Service 执行完整的【连接 -> 发包 -> 验证】流程
            // result 包含: { deviceId, type, version }
            const result = await bleService.addDevice(deviceId);

            // 3. 验证通过，执行保存逻辑
            this.handleConnectSuccess(deviceId, result);

        } catch (err) {
            console.error(err);
            wx.hideLoading();
            
            // 友好的错误提示
            let msg = err.message || '配对失败';
            if (msg.includes('10003')) msg = '无法连接设备，请重试';

            wx.showModal({
                title: '添加失败',
                content: msg,
                showCancel: false,
                confirmText: '知道了'
            });
            
            // 失败后断开连接，防止占用
            bleService.disconnect();
            
            // 可选：重新开始扫描
            // this.startScan();
        }
    },

    /**
     * 处理连接成功后的存储和跳转
     */
    handleConnectSuccess(deviceId, protocolResult) {
        wx.hideLoading();
        wx.showToast({
            title: '添加成功',
            icon: 'success'
        });

        // 1. 获取扫描到的原始信息 (包含 name, RSSI 等)
        const scannedInfo = this.data.allDevices.find(d => d.deviceId === deviceId);
        
        if (scannedInfo) {
            // 2. 构造最终存储的设备对象
            // 合并 扫描信息(UI用) + 协议返回信息(业务用)
            const finalDevice = {
                ...scannedInfo,
                type: protocolResult.type,        // 协议确认的真实类型
                fwVersion: protocolResult.version,// 协议确认的固件版本
                status: 0,                        // 默认关机状态
                addTime: Date.now()
            };

            // 3. 保存到设备列表
            const userDevices = wx.getStorageSync(USER_DEVICES_KEY) || [];
            userDevices.push(finalDevice);
            wx.setStorageSync(USER_DEVICES_KEY, userDevices);

            // 4. 保存到ID列表 (用于快速过滤)
            let addedIds = wx.getStorageSync(ADDED_DEVICE_IDS_KEY) || [];
            if (!addedIds.includes(deviceId)) {
                addedIds.push(deviceId);
                wx.setStorageSync(ADDED_DEVICE_IDS_KEY, addedIds);
                this.setData({ addedDeviceIds: addedIds });
            }

            // 5. 通知主页刷新
            const pages = getCurrentPages();
            if (pages.length > 1) {
                const prevPage = pages[pages.length - 2];
                prevPage.setData({ needsRefresh: true });
            }

            // 6. 返回主页
            setTimeout(() => {
                wx.navigateBack();
            }, 1500);
        }
    }
})