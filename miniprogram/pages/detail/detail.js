// pages/detail/detail.js
const { getSpotLatLng, buildCityAverages, openBaike } = require('../../utils/util')
const { provinceCenters, cityCenters } = require('../../data/spots')

const app = getApp()

function buildShareTitle(spot) {
  if (!spot || !spot.name) return '5A景区大全'
  const location = [spot.province, spot.city].filter(Boolean).join(' · ')
  return location ? `${spot.name}｜${location}｜5A景区大全` : `${spot.name}｜5A景区大全`
}

Page({
  data: {
    spot: null,
    coord: null
  },

  onLoad(options) {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })

    const index = parseInt(options.index, 10)
    const spot = app.globalData.spots[index]
    if (!spot) return

    this.spotIndex = index
    const cityAverages = buildCityAverages(app.globalData.spots)
    const coord = getSpotLatLng(spot, cityAverages, cityCenters, provinceCenters)

    this.setData({
      spot,
      coord: {
        lat: coord.lat.toFixed(3),
        lng: coord.lng.toFixed(3),
        source: coord.source
      }
    })

    wx.setNavigationBarTitle({ title: spot.name })
  },

  onShareAppMessage() {
    const { spot } = this.data
    if (!spot || !Number.isInteger(this.spotIndex)) {
      return {
        title: '5A景区大全',
        path: '/pages/index/index'
      }
    }

    return {
      title: buildShareTitle(spot),
      path: `/pages/detail/detail?index=${this.spotIndex}`
    }
  },

  onShareTimeline() {
    const { spot } = this.data
    if (!spot || !Number.isInteger(this.spotIndex)) {
      return { title: '5A景区大全', query: '' }
    }

    return {
      title: buildShareTitle(spot),
      query: `index=${this.spotIndex}`
    }
  },

  openBaike() {
    const { spot } = this.data
    openBaike(spot.name, app.globalData.baikeUrls)
  },

  openMap() {
    const { spot, coord } = this.data
    wx.openLocation({
      latitude: parseFloat(coord.lat),
      longitude: parseFloat(coord.lng),
      name: spot.name,
      scale: 12
    })
  }
})
