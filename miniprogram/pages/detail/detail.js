// pages/detail/detail.js
const { getSpotLatLng, buildCityAverages, openBaike } = require('../../utils/util')
const { provinceCenters, cityCenters } = require('../../data/spots')

const app = getApp()

Page({
  data: {
    spot: null,
    coord: null
  },

  onLoad(options) {
    const index = parseInt(options.index)
    const spot = app.globalData.spots[index]
    if (!spot) return

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
