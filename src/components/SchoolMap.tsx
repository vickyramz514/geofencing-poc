import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';
import MapView, {Circle, Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE} from 'react-native-maps';
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
}

const INITIAL_REGION = {
  latitude: 13.0843,
  longitude: 80.2724,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

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
    return {fill: 'rgba(102, 112, 133, 0.16)', stroke: '#667085'};
  }
  return {fill: 'rgba(152, 162, 179, 0.18)', stroke: '#98A2B3'};
}

export function SchoolMap({
  schools,
  location,
  selectedSchoolId,
  tracking,
  onSelectSchool,
}: SchoolMapProps) {
  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  return (
    <View style={styles.wrap}>
      <MapView
        provider={provider}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        showsUserLocation={tracking}
        showsMyLocationButton={false}
        toolbarEnabled={false}>
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
      <View style={styles.legend}>
        <Text style={styles.legendText}>Green fence: inside</Text>
        <Text style={styles.legendText}>Grey fence: outside</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  map: {
    flex: 1,
  },
  legend: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  legendText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
});
