/**
 * Vector map (MapLibre GL + OpenFreeMap tiles) inside a WebView: smooth zoom/rotate,
 * crisp street labels and 3D buildings — a Google-Maps feel without an API key.
 * Falls back to Leaflet + OpenStreetMap raster tiles on phones without WebGL.
 *
 * Features: markers (numbered pins, truck, home, dot), polylines, auto-fit,
 * tap-to-pick, and a "picker" mode that reports the map centre as the user drags
 * (used by LocationPicker with a fixed pin on top, like Uber / Rapido).
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
  kind?: 'pin' | 'truck' | 'home' | 'dot' | 'depot';
}

export interface MapLine {
  points: [number, number][];
  color?: string;
  dashed?: boolean;
}

export interface MapHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface Props {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  lines?: MapLine[];
  fit?: boolean;
  style?: ViewStyle;
  height?: number | '100%';
  rounded?: boolean;
  interactive?: boolean;
  /** report the centre while the user pans (for a fixed centre pin) */
  picker?: boolean;
  onPress?: (lat: number, lng: number) => void;
  onMarkerPress?: (id: string | number) => void;
  onMoveStart?: () => void;
  onCenter?: (lat: number, lng: number) => void;
}

const HTML = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css"/>
<script src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js"></script>
<style>
html,body,#map{margin:0;height:100%;width:100%;background:#eef1ef;-webkit-tap-highlight-color:transparent}
.mk{display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px -apple-system,Roboto,sans-serif;cursor:pointer}
.mk-pin{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.3)}
.mk-pin span{transform:rotate(45deg)}
.mk-dot{width:14px;height:14px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.mk-round{width:38px;height:38px;border-radius:50%;background:#fff;font-size:19px;box-shadow:0 3px 10px rgba(0,0,0,.3);border:3px solid}
.mk-truck{animation:pulse 2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(30,78,140,.45)}70%{box-shadow:0 0 0 14px rgba(30,78,140,0)}100%{box-shadow:0 0 0 0 rgba(30,78,140,0)}}
.maplibregl-popup-content{font:13px -apple-system,Roboto,sans-serif;padding:8px 12px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.18)}
.maplibregl-ctrl-attrib{font-size:9px}
.leaflet-container{background:#eef1ef}
</style></head><body><div id="map"></div><script>
var send=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))};
var VELLORE=[12.9165,79.1325];var last=null;var fitted=false;var M=null;
function glyph(m){var k=m.kind||'pin';if(k==='truck')return '&#128667;';if(k==='home')return '&#127968;';if(k==='depot')return '&#127970;';return m.label||''}
function el(m){var k=m.kind||'pin';var c=m.color||'#1B7F5A';var d=document.createElement('div');
 if(k==='pin'){d.className='mk mk-pin';d.style.background=c;d.innerHTML='<span>'+glyph(m)+'</span>'}
 else if(k==='dot'){d.className='mk mk-dot';d.style.background=c}
 else{d.className='mk mk-round'+(k==='truck'?' mk-truck':'');d.style.borderColor=c;d.innerHTML=glyph(m)}
 d.addEventListener('click',function(e){e.stopPropagation();send({type:'marker',id:m.id})});return d}

/* ---------------- MapLibre (vector) ---------------- */
function startGL(){
 var RASTER={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'&copy; OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
 var map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[VELLORE[1],VELLORE[0]],zoom:13,attributionControl:{compact:true},dragRotate:true,pitchWithRotate:false,fadeDuration:0});
 var loaded=false,usedFallback=false,markers=[];
 map.on('error',function(e){if(!loaded&&!usedFallback){usedFallback=true;map.setStyle(RASTER)}});
 setTimeout(function(){if(!loaded&&!usedFallback){usedFallback=true;map.setStyle(RASTER)}},15000);
 function drawLines(d){var feats=(d.lines||[]).filter(function(l){return l.points.length>1}).map(function(l){
   return {type:'Feature',properties:{color:l.color||'#1B7F5A',dashed:!!l.dashed},geometry:{type:'LineString',coordinates:l.points.map(function(p){return [p[1],p[0]]})}}});
  var data={type:'FeatureCollection',features:feats};var src=map.getSource('lines');
  if(src){src.setData(data);return}
  map.addSource('lines',{type:'geojson',data:data});
  map.addLayer({id:'lines-casing',type:'line',source:'lines',filter:['!',['get','dashed']],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffffff','line-width':8,'line-opacity':.9}});
  map.addLayer({id:'lines',type:'line',source:'lines',filter:['!',['get','dashed']],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','color'],'line-width':5}});
  map.addLayer({id:'lines-dash',type:'line',source:'lines',filter:['get','dashed'],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','color'],'line-width':3.5,'line-dasharray':[1.5,2]}})}
 function apply(d){if(!loaded)return;markers.forEach(function(m){m.remove()});markers=[];var b=[];
  try{drawLines(d)}catch(e){}
  (d.lines||[]).forEach(function(l){l.points.forEach(function(p){b.push(p)})});
  (d.markers||[]).forEach(function(m){var k=m.kind||'pin';var mk=new maplibregl.Marker({element:el(m),anchor:k==='pin'?'bottom':'center'}).setLngLat([m.lng,m.lat]);
   if(m.title)mk.setPopup(new maplibregl.Popup({offset:22,closeButton:false}).setText(m.title));mk.addTo(map);markers.push(mk);b.push([m.lat,m.lng])});
  if(d.fit&&b.length&&(!fitted||d.refit)){fitted=true;
   if(b.length===1)map.jumpTo({center:[b[0][1],b[0][0]],zoom:Math.max(map.getZoom(),15)});
   else{var bb=new maplibregl.LngLatBounds();b.forEach(function(p){bb.extend([p[1],p[0]])});map.fitBounds(bb,{padding:48,duration:0,maxZoom:16})}}
  else if(d.center&&!fitted){map.jumpTo({center:[d.center[1],d.center[0]],zoom:d.zoom||14});fitted=!!d.fit||!!d.picker}
  if(d.interactive===false){map.dragPan.disable();map.scrollZoom.disable();map.touchZoomRotate.disable();map.doubleClickZoom.disable()}}
 map.on('load',function(){loaded=true;if(last)apply(last);send({type:'ready'})});
 map.on('styledata',function(){if(loaded&&last&&!map.getSource('lines')){try{drawLines(last)}catch(e){}}});
 map.on('click',function(e){send({type:'press',lat:e.lngLat.lat,lng:e.lngLat.lng})});
 map.on('movestart',function(e){if(e.originalEvent)send({type:'movestart'})});
 map.on('moveend',function(){var c=map.getCenter();send({type:'center',lat:c.lat,lng:c.lng})});
 return {update:function(d){last=d;apply(d)},fly:function(lat,lng,z){map.flyTo({center:[lng,lat],zoom:z||Math.max(map.getZoom(),16),speed:1.6})}};
}

/* ---------------- Leaflet fallback (raster) ---------------- */
function startLeaflet(done){
 var css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);
 var s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
 s.onload=function(){var map=L.map('map',{zoomControl:false}).setView(VELLORE,13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
  var layer=L.layerGroup().addTo(map);
  map.on('click',function(e){send({type:'press',lat:e.latlng.lat,lng:e.latlng.lng})});
  map.on('movestart',function(){send({type:'movestart'})});
  map.on('moveend',function(){var c=map.getCenter();send({type:'center',lat:c.lat,lng:c.lng})});
  function apply(d){layer.clearLayers();var b=[];
   (d.lines||[]).forEach(function(l){if(l.points.length<2)return;L.polyline(l.points,{color:l.color||'#1B7F5A',weight:5,opacity:.9,dashArray:l.dashed?'6 8':null}).addTo(layer);l.points.forEach(function(p){b.push(p)})});
   (d.markers||[]).forEach(function(m){var k=m.kind||'pin';var sz=k==='pin'?[30,30]:k==='dot'?[14,14]:[38,38];
    var ic=L.divIcon({className:'',iconSize:sz,iconAnchor:k==='pin'?[15,30]:[sz[0]/2,sz[1]/2],html:el(m).outerHTML});
    var mk=L.marker([m.lat,m.lng],{icon:ic}).addTo(layer);if(m.title)mk.bindPopup(m.title);mk.on('click',function(){send({type:'marker',id:m.id})});b.push([m.lat,m.lng])});
   if(d.fit&&b.length&&(!fitted||d.refit)){fitted=true;if(b.length===1)map.setView(b[0],Math.max(map.getZoom(),15));else map.fitBounds(b,{padding:[40,40]})}
   else if(d.center&&!fitted){map.setView(d.center,d.zoom||14);fitted=!!d.fit||!!d.picker}}
  done({update:function(d){last=d;apply(d)},fly:function(lat,lng,z){map.flyTo([lat,lng],z||Math.max(map.getZoom(),16))}});send({type:'ready'})};
 document.head.appendChild(s)}

function hasGL(){try{var c=document.createElement('canvas');return !!(window.WebGLRenderingContext&&(c.getContext('webgl2')||c.getContext('webgl')))}catch(e){return false}}
window.update=function(d){last=d;if(M)M.update(d)};
window.fly=function(lat,lng,z){if(M)M.fly(lat,lng,z)};
try{if(window.maplibregl&&hasGL()){M=startGL()}else{startLeaflet(function(m){M=m;if(last)M.update(last)})}}
catch(e){document.getElementById('map').innerHTML='';startLeaflet(function(m){M=m;if(last)M.update(last)})}
</script></body></html>`;

const MapView = forwardRef<MapHandle, Props>(function MapView(
  { center, zoom, markers = [], lines = [], fit = true, style, height = 260, rounded = true, interactive = true, picker, onPress, onMarkerPress, onMoveStart, onCenter },
  ref,
) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const payload = useMemo(() => JSON.stringify({ center, zoom, markers, lines, fit, picker, interactive }), [center, zoom, markers, lines, fit, picker, interactive]);

  useEffect(() => {
    if (ready) web.current?.injectJavaScript(`window.update(${payload});true;`);
  }, [ready, payload]);

  // markers can be sent before the map is ready; the page keeps the last payload
  useEffect(() => {
    web.current?.injectJavaScript(`window.update&&window.update(${payload});true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, z) => web.current?.injectJavaScript(`window.fly(${lat},${lng},${z ?? 'undefined'});true;`),
  }));

  return (
    <View style={[styles.wrap, rounded && styles.rounded, { height: height as any }, style]}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html: HTML, baseUrl: 'https://smartroute.app' }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        overScrollMode="never"
        setBuiltInZoomControls={false}
        onLoadEnd={() => web.current?.injectJavaScript(`window.update&&window.update(${payload});true;`)}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'ready') setReady(true);
            else if (msg.type === 'press') onPress?.(msg.lat, msg.lng);
            else if (msg.type === 'marker') onMarkerPress?.(msg.id);
            else if (msg.type === 'movestart') onMoveStart?.();
            else if (msg.type === 'center') onCenter?.(msg.lat, msg.lng);
          } catch {
            /* ignore */
          }
        }}
        style={{ backgroundColor: '#eef1ef' }}
      />
    </View>
  );
});

export default MapView;

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#eef1ef' },
  rounded: { borderRadius: radius.lg },
});
