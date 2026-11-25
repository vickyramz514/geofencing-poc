import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import MapView, {
  Circle,
  Polyline,
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';
import type {Coordinates, LocationFix, Presence, School} from '../types';
import {colors, spacing} from '../theme';

export interface SchoolMapItem {
  school: School;
  presence: Presence | 'unknown';
}

interface SchoolMapProps {
  schools: SchoolMapItem[];
  location: LocationFix | null;
  selectedSchoolId: string | null;
  tracking: boolean;
  onSelectSchool: (schoolId: string) => void;
  focus?: {latitude: number; longitude: number} | null;
  fenceRadiusMeters?: number;
  deviceName: string;
  trail: Coordinates[];
  fitRequest: number;
}

const MIN_DELTA = 0.0006;
const MAX_DELTA = 0.5;

const darkMap = [
  {elementType: 'geometry', stylers: [{color: '#142b45'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#9db8d1'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#0a1b31'}]},
  {featureType: 'road', elementType: 'geometry', stylers: [{color: '#2a4b6f'}]},
  {featureType: 'road.highway', elementType: 'geometry', stylers: [{color: '#476888'}]},
  {featureType: 'water', elementType: 'geometry', stylers: [{color: '#073d78'}]},
  {featureType: 'poi.park', elementType: 'geometry', stylers: [{color: '#103d3e'}]},
];

function regionAround(
  center: {latitude: number; longitude: number},
  delta: number,
): Region {
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

function clampDelta(value: number): number {
  return Math.min(MAX_DELTA, Math.max(MIN_DELTA, value));
}

function deltaForRadius(radiusMeters: number): number {
  return clampDelta((Math.max(radiusMeters, 50) * 4.8) / 111_320);
}

export function SchoolMap({
  schools,
  location,
  selectedSchoolId,
  tracking,
  onSelectSchool,
  focus,
  fenceRadiusMeters = 100,
  deviceName,
  trail,
  fitRequest,
}: SchoolMapProps) {
  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef<Region>(
    regionAround(
      focus ?? location ?? {latitude: 13.0566, longitude: 80.2537},
      focus ? deltaForRadius(fenceRadiusMeters) : 0.04,
    ),
  );
  const fittedOffice = useRef<string | null>(null);
  const introUntil = useRef(0);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid'>('standard');
  const [follow, setFollow] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const animateTo = (next: Region, duration: number) => {
    regionRef.current = next;
    mapRef.current?.animateToRegion(next, duration);
  };

  useEffect(() => {
    if (!focus) {
      return;
    }
    const centerKey = `${focus.latitude.toFixed(5)},${focus.longitude.toFixed(5)}`;
    const key = `${centerKey}:${fenceRadiusMeters}`;
    if (fittedOffice.current === key) {
      return;
    }
    const sameCenter = fittedOffice.current?.startsWith(`${centerKey}:`) === true;
    fittedOffice.current = key;
    const fenceDelta = deltaForRadius(fenceRadiusMeters);
    if (sameCenter) {
      animateTo(regionAround(focus, fenceDelta), 400);
      return;
    }
    introUntil.current = Date.now() + 900;
    const wide = regionAround(focus, Math.max(0.035, fenceDelta * 1.6));
    animateTo(wide, 1);
    const timer = setTimeout(() => {
      animateTo(regionAround(focus, fenceDelta), 700);
    }, 90);
    return () => clearTimeout(timer);
  }, [focus, fenceRadiusMeters]);

  useEffect(() => {
    if (!follow || !location || Date.now() < introUntil.current) {
      return;
    }
    const next = {
      ...regionRef.current,
      latitude: location.latitude,
      longitude: location.longitude,
    };
    animateTo(next, 350);
  }, [follow, location]);

  const zoomBy = (factor: number) => {
    setFollow(false);
    const current = regionRef.current;
    animateTo(
      {
        ...current,
        latitudeDelta: clampDelta(current.latitudeDelta * factor),
        longitudeDelta: clampDelta(current.longitudeDelta * factor),
      },
      320,
    );
  };

  const fitFence = useCallback(() => {
    const center = focus ?? location;
    if (!center) {
      return;
    }
    setFollow(false);
    animateTo(regionAround(center, deltaForRadius(fenceRadiusMeters)), 500);
  }, [focus, location, fenceRadiusMeters]);

  const handledFit = useRef(0);
  useEffect(() => {
    if (fitRequest === handledFit.current) return;
    handledFit.current = fitRequest;
    fitFence();
  }, [fitRequest, fitFence]);

  const mapTypes = ['standard', 'satellite', 'hybrid'] as const;
  const nextMapType = mapTypes[(mapTypes.indexOf(mapType) + 1) % mapTypes.length];

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        provider={provider}
        style={styles.map}
        initialRegion={regionRef.current}
        mapType={mapType}
        userInterfaceStyle="dark"
        customMapStyle={Platform.OS === 'android' && mapType === 'standard' ? darkMap : undefined}
        showsMyLocationButton={false}
        showsCompass
        zoomEnabled
        scrollEnabled
        rotateEnabled
        pitchEnabled
        toolbarEnabled={false}
        mapPadding={{top: 76, right: 52, bottom: 44, left: 16}}
        onPanDrag={() => setFollow(false)}
        onTouchStart={() => setFollow(false)}
        onRegionChangeComplete={region => {
          regionRef.current = region;
        }}>
        {trail.length > 1 && <Polyline coordinates={trail} strokeColor="#10bcff" strokeWidth={4} />}
        {location ? (
          <>
            <Circle
              center={{latitude: location.latitude, longitude: location.longitude}}
              radius={Math.max(location.accuracy, 1)}
              fillColor="rgba(24, 95, 165, 0.15)"
              strokeColor="rgba(24, 95, 165, 0.8)"
              strokeWidth={1}
            />
            {tracking ? (
              <Marker
                coordinate={{latitude: location.latitude, longitude: location.longitude}}
                anchor={{x: 0.5, y: 0.5}}
                title={deviceName}
                zIndex={1}>
                <View style={styles.truckMarker}>
                  <Text style={styles.truckIcon}>🚚</Text>
                </View>
              </Marker>
            ) : null}
          </>
        ) : null}
        {schools.map(item => {
          const selected = item.school.id === selectedSchoolId;
          return (
            <React.Fragment key={item.school.id}>
              <Circle
                center={{
                  latitude: item.school.latitude,
                  longitude: item.school.longitude,
                }}
                radius={item.school.radiusMeters}
                fillColor="rgba(0, 174, 255, 0.24)"
                strokeColor="#1ad3ff"
                strokeWidth={selected ? 3 : 2}
              />
              <Marker
                coordinate={{
                  latitude: item.school.latitude,
                  longitude: item.school.longitude,
                }}
                title={item.school.name}
                pinColor={item.school.color}
                onPress={() => onSelectSchool(item.school.id)}
              />
            </React.Fragment>
          );
        })}
      </MapView>

      <View style={styles.controls}>
        <MapButton
          label={optionsOpen ? '×' : '▱'}
          accessibilityLabel={optionsOpen ? 'Hide map options' : 'Show map options'}
          onPress={() => setOptionsOpen(open => !open)}
        />
        <MapButton label="+" accessibilityLabel="Zoom in" onPress={() => zoomBy(0.5)} />
        <MapButton label="−" accessibilityLabel="Zoom out" onPress={() => zoomBy(2)} />
        <MapButton label="⌖" accessibilityLabel="Fit the geofence" onPress={fitFence} />
        {optionsOpen ? (
          <View style={styles.options}>
            <MapButton
              label={nextMapType === 'satellite' ? 'Satellite' : nextMapType === 'hybrid' ? 'Hybrid' : 'Map'}
              accessibilityLabel={`Switch to ${nextMapType} map`}
              onPress={() => setMapType(nextMapType)}
            />
            <MapButton
              label={follow ? 'Following' : 'Follow'}
              accessibilityLabel={follow ? 'Stop following the truck' : 'Follow the truck'}
              active={follow}
              onPress={() => setFollow(current => !current)}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function MapButton({
  label,
  accessibilityLabel,
  onPress,
  active,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({pressed}) => [
        styles.control,
        active && styles.controlActive,
        pressed && styles.controlPressed,
      ]}>
      <Text style={[styles.controlText, active && styles.controlTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#102741',
  },
  map: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  truckMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderColor: '#29c7ff',
    borderWidth: 2,
    backgroundColor: '#073c70',
    alignItems: 'center',
    justifyContent: 'center',
  },
  truckIcon: {
    fontSize: 22,
  },
  controls: {
    position: 'absolute',
    top: 10,
    right: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  options: {
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  control: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    backgroundColor: '#08182bed',
    borderColor: '#3c5d7c',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#101828',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
    elevation: 3,
  },
  controlActive: {
    backgroundColor: colors.primary,
  },
  controlPressed: {
    opacity: 0.8,
  },
  controlText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  controlTextActive: {
    color: colors.white,
  },
});
