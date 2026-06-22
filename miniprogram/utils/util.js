// 工具函数

/**
 * 获取景点坐标，带多级回退
 */
function getSpotLatLng(spot, cityAverages, cityCenters, provinceCenters) {
  if (isFinite(spot.lat) && isFinite(spot.lng)) {
    return { lng: spot.lng, lat: spot.lat, source: '精确坐标', estimated: false }
  }
  const key = spot.province + '|' + spot.city
  if (cityAverages[key]) {
    const avg = cityAverages[key]
    return { lng: avg.lng / avg.count, lat: avg.lat / avg.count, source: '同城估算', estimated: true }
  }
  if (cityCenters[key]) {
    return { lng: cityCenters[key][0], lat: cityCenters[key][1], source: '城市中心', estimated: true }
  }
  const pv = provinceCenters[spot.province] || [104, 35]
  return { lng: pv[0], lat: pv[1], source: '省份中心', estimated: true }
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
