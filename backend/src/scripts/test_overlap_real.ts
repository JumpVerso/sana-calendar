
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { supabase } from '../db/supabase.js';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
    console.log('--- Testing Overlap Logic (Real World) ---');
    const slotsService = await import('../services/slotsService.js');

    const date = '2025-12-25';
    // Clean up
    await supabase.from('time_slots').delete().eq('date', date);

    // Setup: Create a VAGO slot at 10:30 (simulating pre-generated slot)
    // We assume backend creates it as Vago. We can use manual insert or createSlot?
    // createSlot makes it valid. Let's manual insert to mimic empty/vago state.
    await supabase.from('time_slots').insert({
        date,
        time: '10:30:00',
        status: 'Vago',
        sibling_order: 0,
        event_type: null
    });
    console.log('Setup: Vago slot at 10:30');

    // Test 1: Create 1h slot at 10:00. Next slot (10:30) is Vago. Should PASS.
    console.log('\n[Test 1] 1h Slot (10:00) vs Vago Slot (10:30)');
    try {
        await slotsService.createSlot({ date, time: '10:00', eventType: 'online', priceCategory: 'padrao' });
        console.log('PASS: Created 10:00 (1h) successfully (ignored Vago at 10:30)');
    } catch (e: any) {
        console.error('FAIL: Blocked valid creation:', e.message);
    }

    // Cleanup
    await supabase.from('time_slots').delete().eq('date', date);

    // Setup: Create an OCCUPIED slot at 10:30
    await slotsService.createSlot({ date, time: '10:30', eventType: 'personal', status: 'Almoço' });
    console.log('Setup: Personal slot at 10:30');

    // Test 2: Create 1h slot at 10:00. Next slot (10:30) is Occupied. Should FAIL.
    console.log('\n[Test 2] 1h Slot (10:00) vs Occupied Slot (10:30)');
    try {
        await slotsService.createSlot({ date, time: '10:00', eventType: 'online', priceCategory: 'padrao' });
        console.error('FAIL: Should have blocked 10:00 creation');
    } catch (e: any) {
        console.log('PASS: Blocked as expected:', e.message);
    }

    // Cleanup
    await supabase.from('time_slots').delete().eq('date', date);
}

run().catch(console.error);
