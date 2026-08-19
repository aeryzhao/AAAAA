// pages/index/index.js
const { filterSpots, buildCityAverages, getSpotLatLng, openBaike } = require('../../utils/util')

const app = getApp()
const ITEMS_PER_PAGE = 20

Page({
  data: {
    // 筛选
    keyword: '',
    provinceIndex: 0,
    categoryIndex: 0,
    yearIndex: 0,
    provinceOptions: ['全部省份'],
    categoryOptions: ['全部类别'],
    yearOptions: ['全部年份'],
    // 列表
    displayList: [],
    filteredCount: 0,
    currentPage: 1,
    totalPages: 1,
    hasFilter: false
  },

  onLoad() {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    console.log('[Index] onLoad 开始')
    this.initData()
  },

  onShareAppMessage() {
    return {
      title: '5A景区大全｜全国景区列表',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: '5A景区大全｜全国景区列表',
      query: ''
    }
  },

  onShow() {
    // 每次显示页面时检查数据（处理异步加载的情况）
    if (this.data.displayList.length === 0 && app.globalData.spots.length > 0) {
      console.log('[Index] onShow: 重新初始化数据')
      this.initData()
    }
  },

  initData() {
    const { spots, provinces, categories, years } = app.globalData
    console.log('[Index] initData: spots数量 =', spots.length)

    if (spots.length === 0) {
      console.warn('[Index] spots为空，延迟重试')
      setTimeout(() => this.initData(), 100)
      return
    }

    this.setData({
      provinceOptions: ['全部省份', ...provinces],
      categoryOptions: ['全部类别', ...categories],
      yearOptions: ['全部年份', ...years.map(y => y + '年')]
    })
    this.applyFilter()
  },

  // 搜索
  onSearchInput(e) {
    this._searchTimer && clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      this.setData({ keyword: e.detail.value, currentPage: 1 })
      this.applyFilter()
    }, 300)
  },

  clearSearch() {
    this.setData({ keyword: '', currentPage: 1 })
    this.applyFilter()
  },

  // 筛选
  onProvinceChange(e) {
    this.setData({ provinceIndex: e.detail.value, currentPage: 1 })
    this.applyFilter()
  },

  onCategoryChange(e) {
    this.setData({ categoryIndex: e.detail.value, currentPage: 1 })
    this.applyFilter()
  },

  onYearChange(e) {
    this.setData({ yearIndex: e.detail.value, currentPage: 1 })
    this.applyFilter()
  },

  // 应用筛选
  applyFilter() {
    const { spots } = app.globalData
    const { provinceIndex, categoryIndex, yearIndex, keyword, currentPage } = this.data
    const { provinceOptions, categoryOptions, yearOptions } = this.data

    console.log('[Index] applyFilter: spots =', spots.length, 'province =', provinceOptions[provinceIndex])

    const filtered = filterSpots(spots, {
      province: provinceOptions[provinceIndex],
      category: categoryOptions[categoryIndex],
      year: yearOptions[yearIndex] === '全部年份' ? '全部' : yearOptions[yearIndex].replace('年', ''),
      keyword
    })

    console.log('[Index] applyFilter: filtered =', filtered.length)

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
    const page = Math.min(currentPage, totalPages)
    const start = (page - 1) * ITEMS_PER_PAGE
    const displayList = filtered.slice(start, start + ITEMS_PER_PAGE).map((spot, i) => ({
      ...spot,
      originalIndex: spots.indexOf(spot)
    }))

    const hasFilter = provinceIndex > 0 || categoryIndex > 0 || yearIndex > 0 || !!keyword

    this.setData({
      displayList,
      filteredCount: filtered.length,
      totalPages,
      currentPage: page,
      hasFilter
    })

    console.log('[Index] applyFilter: displayList =', displayList.length, 'totalPages =', totalPages)
  },

  // 分页
  goPrevPage() {
    if (this.data.currentPage > 1) {
      this.setData({ currentPage: this.data.currentPage - 1 })
      this.applyFilter()
      wx.pageScrollTo({ scrollTop: 0, duration: 200 })
    }
  },

  goNextPage() {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({ currentPage: this.data.currentPage + 1 })
      this.applyFilter()
      wx.pageScrollTo({ scrollTop: 0, duration: 200 })
    }
  },

  // 导航
  goDetail(e) {
    const index = e.currentTarget.dataset.index
    wx.navigateTo({ url: `/pages/detail/detail?index=${index}` })
  },

  openMap(e) {
    const index = e.currentTarget.dataset.index
    const spot = app.globalData.spots[index]
    if (!spot) return
    const cityAverages = buildCityAverages(app.globalData.spots)
    const { provinceCenters, cityCenters } = app.globalData
    const coord = getSpotLatLng(spot, cityAverages, cityCenters, provinceCenters)

    wx.openLocation({
      latitude: coord.lat,
      longitude: coord.lng,
      name: spot.name,
      scale: 12
    })
  },

  openBaike(e) {
    const index = e.currentTarget.dataset.index
    const spot = app.globalData.spots[index]
    if (!spot) return
    openBaike(spot.name, app.globalData.baikeUrls)
  }
})
