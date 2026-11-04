/**
 * Free OpenStreetMap map (Leaflet inside a WebView) — no Google Maps API key needed.
 * Supports markers (with numbers / labels), polylines, tap-to-pick and auto-fit.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { colors, radius } from './theme';

export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  color?: string;
  label?: string; // short text inside the pin (e.g. stop number)
  title?: string; // popup text
  kind?: 'pin' | 'truck' | 'home' | 'dot';
}

export interface MapLine {
  points: [number, number][];
  color?: string;
  dashed?: boolean;
}

interface Props {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  lines?: MapLine[];
  fit?: boolean;
  style?: ViewStyle;
  height?: number;
  onPress?: (lat: number, lng: number) => void;
  onMarkerPress?: (id: string | number) => void;
}

const HTML = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;height:100%;width:100%;background:#e9eef0}
.pin{display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px -apple-system,Roboto,sans-serif;
 border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.pin-pin{width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg)}
.pin-pin span{transform:rotate(45deg)}
.pin-dot{width:14px;height:14px;border-radius:50%}
.pin-truck,.pin-home{width:32px;height:32px;border-radius:50%;font-size:17px}
.leaflet-popup-content{font:13px -apple-system,Roboto,sans-serif;margin:8px 10px}
</style></head><body><div id="map"></div><script>
var send=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))};
var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([12.9165,79.1325],13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
 {maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
var layer=L.layerGroup().addTo(map);var fitted=false;
map.on('click',function(e){send({type:'press',lat:e.latlng.lat,lng:e.latlng.lng})});
function icon(m){var k=m.kind||'pin';var c=m.color||'#1B7F5A';var t=m.label||'';
 if(k==='truck')t='&#128667;';if(k==='home')t='&#127968;';
 var size=k==='pin'?[26,26]:k==='dot'?[14,14]:[32,32];
 var anchor=k==='pin'?[13,26]:[size[0]/2,size[1]/2];
 return L.divIcon({className:'',iconSize:size,iconAnchor:anchor,popupAnchor:[0,-size[1]/2],
  html:'<div class="pin pin-'+k+'" style="background:'+(k==='truck'||k==='home'?'#fff':c)+';'+(k==='truck'||k==='home'?'border-color:'+c+';border-width:3px':'')+'"><span>'+t+'</span></div>'})}
window.update=function(d){layer.clearLayers();var b=[];
 (d.lines||[]).forEach(function(l){if(l.points.length<2)return;L.polyline(l.points,{color:l.color||'#1B7F5A',weight:4,opacity:.85,dashArray:l.dashed?'6 8':null}).addTo(layer);l.points.forEach(function(p){b.push(p)})});
 (d.markers||[]).forEach(function(m){var mk=L.marker([m.lat,m.lng],{icon:icon(m),zIndexOffset:m.kind==='truck'?1000:0}).addTo(layer);
  if(m.title)mk.bindPopup(m.title);mk.on('click',function(){send({type:'marker',id:m.id})});b.push([m.lat,m.lng])});
 if(d.fit&&b.length&&(!fitted||d.refit)){fitted=true;if(b.length===1)map.setView(b[0],Math.max(map.getZoom(),15));else map.fitBounds(b,{padding:[36,36]})}
 else if(d.center&&!fitted){map.setView(d.center,d.zoom||14);fitted=!!d.fit}};
window.recenter=function(lat,lng,z){map.setView([lat,lng],z||map.getZoom())};
send({type:'ready'});
</script></body></html>`;

export default function MapView({ center, zoom, markers = [], lines = [], fit = true, style, height = 260, onPress, onMarkerPress }: Props) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const payload = useMemo(() => JSON.stringify({ center, zoom, markers, lines, fit }), [center, zoom, markers, lines, fit]);

  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.update(${payload});true;`);
  }, [ready, payload]);

  return (
    <View style={[styles.wrap, { height }, style]}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: HTML, baseUrl: 'https://smartroute.app' }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'ready') setReady(true);
            else if (msg.type === 'press') onPress?.(msg.lat, msg.lng);
            else if (msg.type === 'marker') onMarkerPress?.(msg.id);
          } catch {
            /* ignore */
          }
        }}
        style={{ backgroundColor: '#e9eef0' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#e9eef0', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
