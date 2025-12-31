// index.js

// 定义本地缓存的键名
const USER_DEVICES_KEY = 'SMART_USER_DEVICES';
const ADDED_DEVICE_IDS_KEY = 'ADDED_DEVICE_IDS';

/**
 * 从本地缓存同步获取完整的设备列表
 */
function getUserDevices() {
  try {
    const list = wx.getStorageSync(USER_DEVICES_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('获取用户设备列表失败', e);
    return [];
  }
}
/**
 * 同步保存完整的设备列表到本地缓存
 */
function saveUserDevices(list) {
  try {
    wx.setStorageSync(USER_DEVICES_KEY, list);
  } catch (e) {
    console.error('保存用户设备列表失败', e);
  }
} 
/**
 * 从本地缓存同步获取用于搜索过滤的设备ID列表
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
/**
 * 同步保存用于搜索过滤的设备ID列表
 */
function saveAddedDeviceIds(ids) {
  try {
    wx.setStorageSync(ADDED_DEVICE_IDS_KEY, ids);
  } catch (e) {
    console.error('保存已添加设备ID失败', e);
  }
}


Page({
  data: {
    deviceList: [],
    needsRefresh: false // 刷新标志
  },


  onLoad() {
    // 首次加载时，从缓存中读取数据
    this.loadDeviceList();
  },

  onShow() {
    // 从其他页面（如添加页）返回时触发
    if (this.data.needsRefresh) {
      this.loadDeviceList();
      // 重置刷新标志位
      this.setData({ needsRefresh: false });
    }
  },

  /**
   * 从本地缓存加载完整的设备列表并更新视图
   */
  loadDeviceList() {
    const list = getUserDevices();
    if (list.length === 0) {

    }

    this.setData({
      deviceList: list
    });
  },

  // 添加设备
  onAddDevice() {
    wx.vibrateShort({ type: 'light' });
    wx.navigateTo({
      url: '/pages/addDevice/addDevice',
    })
  },

  // 点击设备卡片
  onDeviceTap(e) {
    const id = e.currentTarget.dataset.id;
    console.log("进入详情 ID:", id);
  },

  // 快捷开关
  onSwitchTap(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.deviceList;

    wx.vibrateShort({ type: 'medium' });

    list[index].status = !list[index].status;
    this.setData({ deviceList: list });
    saveUserDevices(list);
  },

  // 长按删除逻辑 
  onDeviceLongPress(e) {
    const index = e.currentTarget.dataset.index;
    const deviceId = this.data.deviceList[index].deviceId;
    const deviceName = this.data.deviceList[index].name;

    wx.vibrateShort({ type: 'heavy' });

    wx.showActionSheet({
      itemList: [`删除设备：${deviceName}`],
      itemColor: '#FF3B30',
      success: (res) => {
        if (res.tapIndex === 0) {
          const list = this.data.deviceList;
 
          list.splice(index, 1);
          let addedIds = getAddedDeviceIds();
          const idIndex = addedIds.indexOf(deviceId);
          if (idIndex > -1) {
            addedIds.splice(idIndex, 1);
            saveAddedDeviceIds(addedIds); 
          }
          this.setData({ deviceList: list });
          saveUserDevices(list);
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },
})