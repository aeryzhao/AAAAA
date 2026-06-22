// pages/map/map.js
const { filterSpots, buildCityAverages, getSpotLatLng, getSpotsBounds } = require('../../utils/util')

const app = getApp()

Page({
  data: {
    // 筛选
    provinceIndex: 0,
    categoryIndex: 0,
    provinceOptions: ['全部省份'],
    categoryOptions: ['全部类别'],
    // 地图
    centerLat: 35.86,
    centerLng: 104.19,
    scale: 5,
    markers: [],
    markerCount: 0
  },

  onLoad() {
    console.log('[Map] onLoad 开始')
    this.initData()
  },

  onShow() {
    if (this.data.markers.length === 0 && app.globalData.spots.length > 0) {
      console.log('[Map] onShow: 重新初始化')
      this.initData()
    }
  },

  initData() {
    const { spots, provinces, categories } = app.globalData
    if (spots.length === 0) {
      console.warn('[Map] spots为空，延迟重试')
      setTimeout(() => this.initData(), 100)
      return
    }

    console.log('[Map] initData: spots =', spots.length)
    this.setData({
      provinceOptions: ['全部省份', ...provinces],
      categoryOptions: ['全部类别', ...categories]
    })
    this.cityAverages = buildCityAverages(spots)
    this._labelsVisible = false
    this.updateMarkers()
  },

  // 筛选
  onProvinceChange(e) {
    this.setData({ provinceIndex: e.detail.value })
    this.updateMarkers()
  },

  onCategoryChange(e) {
    this.setData({ categoryIndex: e.detail.value })
    this.updateMarkers()
  },

  // 更新标记点
  updateMarkers() {
    const { spots, provinceCenters, cityCenters } = app.globalData
    const { provinceIndex, categoryIndex, provinceOptions, categoryOptions } = this.data

    const filtered = filterSpots(spots, {
      province: provinceOptions[provinceIndex],
      category: categoryOptions[categoryIndex]
    })

    console.log('[Map] updateMarkers: filtered =', filtered.length)

    // 构建 markers
    const showLabel = this.data.scale >= 12
    this._filteredSpots = filtered
    const markers = filtered.map((spot, i) => {
      const coord = getSpotLatLng(spot, this.cityAverages, cityCenters, provinceCenters)
      return {
        id: i,
        latitude: coord.lat,
        longitude: coord.lng,
        title: spot.name,
        iconPath: '/assets/marker.png',
        width: 24,
        height: 24,
        callout: {
          content: spot.name + '\n' + spot.province + ' · ' + spot.city + '\n' + spot.category + ' · ' + spot.year + '年',
          color: '#17211f',
          fontSize: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#ded8ca',
          bgColor: '#fffdf8',
          padding: 8,
          display: 'BYCLICK'
        },
        label: {
          content: spot.name,
          color: '#17211f',
          fontSize: 10,
          anchorX: -1,
          anchorY: -32,
          bgColor: '#fffdf8',
          borderRadius: 4,
          padding: 4,
          opacity: showLabel ? 1 : 0
        }
      }
    })

    this._labelsVisible = showLabel
    this.setData({
      markers,
      markerCount: filtered.length
    })

    // 自动调整视野
    if (filtered.length > 0) {
      const bounds = getSpotsBounds(filtered, this.cityAverages, cityCenters, provinceCenters)
      this.setData({
        centerLat: bounds.centerLat,
        centerLng: bounds.centerLng,
        scale: this._calcScale(bounds)
      })
    }
  },

  // 根据边界计算缩放级别
  _calcScale(bounds) {
    const { latDelta, lngDelta } = bounds
    const maxDelta = Math.max(latDelta, lngDelta)
    if (maxDelta > 40) return 4
    if (maxDelta > 25) return 5
    if (maxDelta > 15) return 6
    if (maxDelta > 8) return 7
    if (maxDelta > 4) return 8
    return 9
  },

  // 定位到筛选结果
  fitToFiltered() {
    const { spots, provinceCenters, cityCenters } = app.globalData
    const { provinceIndex, categoryIndex, provinceOptions, categoryOptions } = this.data

    const filtered = filterSpots(spots, {
      province: provinceOptions[provinceIndex],
      category: categoryOptions[categoryIndex]
    })

    if (filtered.length === 0) {
      wx.showToast({ title: '没有匹配的景区', icon: 'none' })
      return
    }

    const bounds = getSpotsBounds(filtered, this.cityAverages, cityCenters, provinceCenters)
    this.setData({
      centerLat: bounds.centerLat,
      centerLng: bounds.centerLng,
      scale: this._calcScale(bounds)
    })
  },

  // 点击标记或标签
  onMarkerTap(e) {
    this._openDetail(e.markerId)
  },

  onLabelTap(e) {
    this._openDetail(e.markerId)
  },

  _openDetail(markerId) {
    const { spots } = app.globalData
    const { provinceIndex, categoryIndex, provinceOptions, categoryOptions } = this.data

    const filtered = filterSpots(spots, {
      province: provinceOptions[provinceIndex],
      category: categoryOptions[categoryIndex]
    })

    const spot = filtered[markerId]
    if (spot) {
      const originalIndex = spots.indexOf(spot)
      wx.navigateTo({ url: `/pages/detail/detail?index=${originalIndex}` })
    }
  },

  onRegionChange(e) {
    if (e.type !== 'end' || !this._filteredSpots) return
    const mapCtx = wx.createMapContext('scenicMap')
    mapCtx.getScale({
      success: (res) => {
        const scale = res.scale
        const showLabel = scale >= 12
        if (showLabel === this._labelsVisible) return
        this._labelsVisible = showLabel
        const markers = this.data.markers.map(m => ({
          ...m,
          label: { ...m.label, opacity: showLabel ? 1 : 0 }
        }))
        this.setData({ markers })
      }
    })
  }
})
