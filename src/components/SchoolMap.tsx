import React, {useEffect, useRef, useState} from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import MapView, {
  Circle,
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';
import type {LocationFix, Presence, School} from '../types';
import {colors, spacing} from '../theme';
import {formatDistance} from '../utils/format';

export interface SchoolMapItem {
  school: School;
  distanceMeters: number | null;
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
}

const MIN_DELTA = 0.0006;
const MAX_DELTA = 0.5;

function presenceLabel(presence: Presence | 'unknown'): string {
  if (presence === 'inside') {
    return 'Inside';
  }
  if (presence === 'outside') {
    return 'Outside';
  }
  return 'Waiting for GPS';
}

function circleColors(presence: Presence | 'unknown'): {fill: string; stroke: string} {
  if (presence === 'inside') {
    return {fill: 'rgba(15, 110, 86, 0.28)', stroke: '#0F6E56'};
  }
  if (presence === 'outside') {
    return {fill: 'rgba(180, 83, 9, 0.18)', stroke: '#B54708'};
  }
  return {fill: 'rgba(152, 162, 179, 0.18)', stroke: '#98A2B3'};
}

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
}: SchoolMapProps) {
  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef<Region>(
    regionAround(
      focus ?? location ?? {latitude: 20, longitude: 78},
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

  const fitFence = () => {
    const center = focus ?? location;
    if (!center) {
      return;
    }
    setFollow(false);
    animateTo(regionAround(center, deltaForRadius(fenceRadiusMeters)), 500);
  };

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
        showsUserLocation={tracking}
        showsMyLocationButton={false}
        showsCompass
        zoomEnabled
        scrollEnabled
        rotateEnabled
        pitchEnabled
        toolbarEnabled={false}
        mapPadding={{top: 168, right: 64, bottom: 96, left: 16}}
        onPanDrag={() => setFollow(false)}
        onTouchStart={() => setFollow(false)}
        onRegionChangeComplete={region => {
          regionRef.current = region;
        }}>
        {location ? (
          <Circle
            center={{latitude: location.latitude, longitude: location.longitude}}
            radius={Math.max(location.accuracy, 1)}
            fillColor="rgba(24, 95, 165, 0.15)"
            strokeColor="rgba(24, 95, 165, 0.8)"
            strokeWidth={1}
          />
        ) : null}
        {schools.map(item => {
          const palette = circleColors(item.presence);
          const selected = item.school.id === selectedSchoolId;
          return (
            <React.Fragment key={item.school.id}>
              <Circle
                center={{
                  latitude: item.school.latitude,
                  longitude: item.school.longitude,
                }}
                radius={item.school.radiusMeters}
                fillColor={palette.fill}
                strokeColor={palette.stroke}
                strokeWidth={selected ? 3 : 2}
              />
              <Marker
                coordinate={{
                  latitude: item.school.latitude,
                  longitude: item.school.longitude,
                }}
                title={item.school.name}
                description={`${formatDistance(item.distanceMeters)} · ${presenceLabel(item.presence)}`}
                pinColor={item.school.color}
                onPress={() => onSelectSchool(item.school.id)}
              />
            </React.Fragment>
          );
        })}
      </MapView>

      <View style={styles.controls}>
        <MapButton label="+" accessibilityLabel="Zoom in" onPress={() => zoomBy(0.5)} />
        <MapButton label="−" accessibilityLabel="Zoom out" onPress={() => zoomBy(2)} />
        <MapButton label="Fit" accessibilityLabel="Fit the office area" onPress={fitFence} />
        <MapButton
          label={optionsOpen ? 'Less' : 'More'}
          accessibilityLabel={optionsOpen ? 'Hide map options' : 'Show map options'}
          onPress={() => setOptionsOpen(open => !open)}
        />
        {optionsOpen ? (
          <View style={styles.options}>
            <MapButton
              label={nextMapType === 'satellite' ? 'Satellite' : nextMapType === 'hybrid' ? 'Hybrid' : 'Map'}
              accessibilityLabel={`Switch to ${nextMapType} map`}
              onPress={() => setMapType(nextMapType)}
            />
            <MapButton
              label={follow ? 'Following' : 'Follow'}
              accessibilityLabel={follow ? 'Stop following your location' : 'Follow your location'}
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
    backgroundColor: colors.surface,
  },
  map: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  controls: {
    position: 'absolute',
    top: 108,
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
    backgroundColor: 'rgba(255,255,255,0.94)',
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
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  controlTextActive: {
    color: colors.white,
  },
});
