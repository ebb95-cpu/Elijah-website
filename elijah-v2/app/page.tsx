import IntroScreen from '@/components/sections/IntroScreen';
import HeroSection from '@/components/sections/HeroSection';
import MovementSection from '@/components/sections/MovementSection';
import FoundationSection from '@/components/sections/FoundationSection';
import StorySection from '@/components/sections/StorySection';
import AskElijahSection from '@/components/sections/AskElijahSection';
import EcosystemSection from '@/components/sections/EcosystemSection';
import ThingsIUsePreview from '@/components/sections/ThingsIUsePreview';
import NewsletterSection from '@/components/sections/NewsletterSection';
import Footer from '@/components/layout/Footer';

export default function HomePage() {
  return (
    <>
      <IntroScreen />
      <HeroSection />
      <MovementSection />
      <FoundationSection />
      <StorySection />
      <AskElijahSection />
      <EcosystemSection />
      <ThingsIUsePreview />
      <NewsletterSection />
      <Footer />
    </>
  );
}
