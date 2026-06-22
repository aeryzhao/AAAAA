App({
  onLaunch() {
    console.log('[App] onLaunch 开始')
    try {
      // 加载景区数据
      const { spots, baikeUrls, provinceCenters, cityCenters } = require('./data/spots')
      console.log('[App] 数据加载成功, spots数量:', spots.length)

      this.globalData.spots = spots
      this.globalData.baikeUrls = baikeUrls
      this.globalData.provinceCenters = provinceCenters
      this.globalData.cityCenters = cityCenters

      // 生成筛选选项
      const provinces = [...new Set(spots.map(s => s.province))].sort()
      const categories = [...new Set(spots.map(s => s.category))].sort()
      const years = [...new Set(spots.map(s => s.year))].sort((a, b) => b - a)
      this.globalData.provinces = provinces
      this.globalData.categories = categories
      this.globalData.years = years

      console.log('[App] 筛选选项生成完成, 省份:', provinces.length, '类别:', categories.length, '年份:', years.length)
    } catch (e) {
      console.error('[App] 数据加载失败:', e)
    }
  },

  globalData: {
    spots: [],
    baikeUrls: {},
    provinceCenters: {},
    cityCenters: {},
    provinces: [],
    categories: [],
    years: []
  }
})
