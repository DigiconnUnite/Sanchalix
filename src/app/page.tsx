import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Icon from '@cloudscape-design/components/icon';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { Metadata } from 'next';
import { svg } from '@/components/icons';

export const metadata: Metadata = { title: 'Dashboard · Vidyawan' };

export default function DashboardPage() {
  return (
    <ContentLayout header={<Header variant="h1">Dashboard</Header>}>
      <Container>
        <Box textAlign="center" color="text-body-secondary" padding="xxl">
          <SpaceBetween size="xs">
            <Icon size="large" svg={svg('school')} />
            <Box variant="h3">Your school isn’t set up yet</Box>
            <Box variant="p">Attendance, fees and announcements appear here once a school is added.</Box>
          </SpaceBetween>
        </Box>
      </Container>
    </ContentLayout>
  );
}
