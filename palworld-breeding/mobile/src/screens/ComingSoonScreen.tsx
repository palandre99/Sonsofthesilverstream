/** Coming-soon placeholder — the full palpedia layout exists from day one;
 * sections light up as they're built. */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { T } from '../theme';
import { Badge, Card, s } from '../ui/kit';

export function ComingSoonScreen({ title, glyph, blurb, planned }: {
  title: string; glyph: string; blurb: string; planned: string[];
}) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ alignItems: 'center', marginTop: 36, marginBottom: 20 }}>
        <Text style={{ fontSize: 56 }}>{glyph}</Text>
        <Text style={[s.h1, { marginTop: 10 }]}>{title}</Text>
        <View style={{ marginTop: 8 }}>
          <Badge kind="gold">COMING SOON</Badge>
        </View>
      </View>
      <Card>
        <Text style={s.body}>{blurb}</Text>
      </Card>
      <Card style={{ marginTop: 10 }}>
        <Text style={s.h3}>Planned</Text>
        <View style={{ marginTop: 8, gap: 6 }}>
          {planned.map((p) => (
            <Text key={p} style={s.body}>•  {p}</Text>
          ))}
        </View>
      </Card>
      <Text style={[s.body, { textAlign: 'center', marginTop: 16, fontSize: 12, color: T.faint }]}>
        The breeding suite comes first — it gets perfected before anything else ships.
      </Text>
    </ScrollView>
  );
}
