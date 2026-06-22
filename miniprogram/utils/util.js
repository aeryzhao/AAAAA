// 工具函数

/**
 * 获取景点坐标，统一使用景区数据中的坐标
 */
function getSpotLatLng(spot, cityAverages, cityCenters, provinceCenters) {
  if (isFinite(spot.lat) && isFinite(spot.lng)) {
    return { lng: spot.lng, lat: spot.lat, source: spot.coordSource || '坐标文件', estimated: false }
  }
  return null
}

/**
 * 筛选景区
 */
function filterSpots(spots, options) {
  const { province, category, year, keyword } = options
  return spots.filter(spot => {
    if (province && !province.startsWith('全部') && spot.province !== province) return false
    if (category && !category.startsWith('全部') && spot.category !== category) return false
    if (year && !year.startsWith('全部') && spot.year !== parseInt(year)) return false
    if (keyword) {
      const kw = keyword.toLowerCase()
      const text = (spot.name + spot.province + spot.city + spot.desc + spot.category).toLowerCase()
      if (!text.includes(kw)) return false
    }
    return true
  })
}

/**
 * 构建城市平均坐标缓存
 */
function buildCityAverages(spots) {
  return spots.reduce((acc, s) => {
    if (isFinite(s.lat) && isFinite(s.lng)) {
      const key = s.province + '|' + s.city
      acc[key] = acc[key] || { lng: 0, lat: 0, count: 0 }
      acc[key].lng += s.lng
      acc[key].lat += s.lat
      acc[key].count++
    }
    return acc
  }, {})
}

/**
 * 计算一组景点的边界
 */
function getSpotsBounds(spots, cityAverages, cityCenters, provinceCenters) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  spots.forEach(spot => {
    const coord = getSpotLatLng(spot, cityAverages, cityCenters, provinceCenters)
    if (!coord) return
    if (coord.lat < minLat) minLat = coord.lat
    if (coord.lat > maxLat) maxLat = coord.lat
    if (coord.lng < minLng) minLng = coord.lng
    if (coord.lng > maxLng) maxLng = coord.lng
  })
  return {
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2,
    latDelta: Math.max(maxLat - minLat, 2),
    lngDelta: Math.max(maxLng - minLng, 2)
  }
}

/**
 * 打开百度百科 - 复制链接到剪贴板
 */
function openBaike(spotName, baikeUrls) {
  const baikeTitle = baikeUrls[spotName] || spotName
  const url = 'https://baike.baidu.com/item/' + encodeURIComponent(baikeTitle)
  wx.setClipboardData({
    data: url,
    success() {
      wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none', duration: 2000 })
    }
  })
}

module.exports = {
  getSpotLatLng,
  filterSpots,
  buildCityAverages,
  getSpotsBounds,
  openBaike
}
