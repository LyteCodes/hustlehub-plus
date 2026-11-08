import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../api/bookings", () => ({
    incomingBookings: vi.fn(),
    income: vi.fn(),
    incomeSummary: vi.fn(),
    setBookingStatus: vi.fn(),
}));

vi.mock("../components/CategoryArt", () => ({
    default: () => null,
}));

import BookingsIncomePage from "../pages/BookingsIncomePage";
import { incomingBookings, income, incomeSummary } from "../api/bookings";

const MOCK_BOOKINGS = {
    data: [
        {
            id: "b1",
            status: "Pending",
            createdAt: "2026-10-01T10:00:00Z",
            gig: { title: "Logo Design", category: "Design", rate: 150000 },
            client: { name: "Alice Smith" },
            transaction: null,
        },
    ],
    meta: { totalPages: 1 },
};

const MOCK_INCOME = {
    data: {
        totalEarned: 150000,
        completedCount: 1,
        pendingCount: 0,
        byMonth: [{ month: "2026-10", count: 1, amount: 150000 }],
        recent: [],
    },
};

const MOCK_SUMMARY = {
    summary: [
        {
            taxYear: "2026/27",
            taxYearPeriod: { start: "2026-03-01", end: "2027-02-28", ytdDays: 100 },
            transactionCount: 1,
            grossIncomeCents: 150000,
            platformFeeCents: 15000,
            netIncomeCents: 135000,
            annualNetIncomeCents: 493000,
            platformFeeRateBps: 1000,
            taxEstimate: {
                taxBeforeRebateCents: 88740,
                rebateCents: 1782000,
                annualTaxPayableCents: 0,
                proratedTaxCents: 0,
                effectiveRatePct: "0.00%",
                marginalRatePct: "18.00%",
                provisionalTax: {
                    firstPaymentCents: 0,
                    secondPaymentCents: 0,
                    dates: {
                        firstDeadline: "2026-08-31",
                        secondDeadline: "2027-02-28",
                        topUpDeadline: "2027-09-30",
                    },
                },
            },
        },
    ],
};

beforeEach(() => {
    incomingBookings.mockResolvedValue(MOCK_BOOKINGS);
    income.mockResolvedValue(MOCK_INCOME);
    incomeSummary.mockResolvedValue(MOCK_SUMMARY);
});

describe("BookingsIncomePage", () => {
    it("renders the page title", async () => {
        render(<BookingsIncomePage />);
        expect(screen.getByRole("heading", { name: /bookings.*income/i })).toBeInTheDocument();
    });

    it("renders all three tab buttons", () => {
        render(<BookingsIncomePage />);
        expect(screen.getByRole("button", { name: "Bookings" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Income" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Tax estimate" })).toBeInTheDocument();
    });

    it("shows bookings tab by default", () => {
        render(<BookingsIncomePage />);
        expect(screen.getByText("Incoming bookings")).toBeInTheDocument();
    });

    it("shows booking row after data loads", async () => {
        render(<BookingsIncomePage />);
        await waitFor(() => {
            expect(screen.getByText("Logo Design")).toBeInTheDocument();
        });
    });

    it("shows empty state when no bookings", async () => {
        incomingBookings.mockResolvedValue({ data: [], meta: { totalPages: 1 } });
        render(<BookingsIncomePage />);
        await waitFor(() => {
            expect(screen.getByText(/no bookings yet/i)).toBeInTheDocument();
        });
    });

    it("shows error state when bookings API fails", async () => {
        incomingBookings.mockRejectedValue(new Error("Network Error"));
        render(<BookingsIncomePage />);
        await waitFor(() => {
            expect(screen.getByText(/failed to load bookings/i)).toBeInTheDocument();
        });
    });

    it("switches to income tab and shows Total earnings", async () => {
        render(<BookingsIncomePage />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Income" }));
        await waitFor(() => {
            expect(screen.getByText("Total earnings")).toBeInTheDocument();
        });
    });

    it("income tab shows correct completed count", async () => {
        render(<BookingsIncomePage />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Income" }));
        await waitFor(() => {
            const completedLabel = screen.getByText("Completed");
            const statCard = completedLabel.closest(".stat-card");
            expect(statCard.querySelector(".stat-value").textContent).toBe("1");
        });
    });

    it("income tab shows error when API fails", async () => {
        income.mockRejectedValue(new Error("Network Error"));
        render(<BookingsIncomePage />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Income" }));
        await waitFor(() => {
            expect(screen.getByText(/failed to load income/i)).toBeInTheDocument();
        });
    });

    it("switches to tax tab and shows Tax year heading", async () => {
        render(<BookingsIncomePage />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Tax estimate" }));
        await waitFor(() => {
            expect(screen.getByText(/tax year/i)).toBeInTheDocument();
        });
    });

    it("tax tab shows effective rate", async () => {
        render(<BookingsIncomePage />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Tax estimate" }));
        await waitFor(() => {
            expect(screen.getByText("Effective rate")).toBeInTheDocument();
        });
    });

    it("tax tab shows empty state when no completed transactions", async () => {
        incomeSummary.mockResolvedValue({ summary: [] });
        render(<BookingsIncomePage />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Tax estimate" }));
        await waitFor(() => {
            expect(screen.getByText(/no completed transactions yet/i)).toBeInTheDocument();
        });
    });

    it("tax tab shows error when API fails", async () => {
        incomeSummary.mockRejectedValue(new Error("Network Error"));
        render(<BookingsIncomePage />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Tax estimate" }));
        await waitFor(() => {
            expect(screen.getByText(/failed to load tax estimate/i)).toBeInTheDocument();
        });
    });
});