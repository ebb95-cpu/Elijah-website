import { NextRequest, NextResponse } from 'next/server';
import { subscribeEmail } from '@/lib/beehiiv';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      source?: string;
    };

    const { email, source: _source } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Email is required.' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!isValidEmail(trimmedEmail)) {
      return NextResponse.json(
        { success: false, message: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const result = await subscribeEmail(trimmedEmail);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.error ?? 'Failed to subscribe. Please try again.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "You're in. Welcome to the movement.",
    });
  } catch (err) {
    console.error('Newsletter route error:', err);
    return NextResponse.json(
      { success: false, message: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
