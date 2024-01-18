import { Button, Divider, IconButton } from "@mui/joy";
import classNames from "classnames";
import { sum } from "lodash-es";
import { Fragment, useEffect, useState } from "react";
import ActivityCalendar from "@/components/ActivityCalendar";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";
import showMemoEditorDialog from "@/components/MemoEditor/MemoEditorDialog";
import MemoFilter from "@/components/MemoFilter";
import MemoView from "@/components/MemoView";
import MobileHeader from "@/components/MobileHeader";
import { memoServiceClient } from "@/grpcweb";
import { DAILY_TIMESTAMP, DEFAULT_MEMO_LIMIT } from "@/helpers/consts";
import { getNormalizedTimeString, getTimeStampByDate } from "@/helpers/datetime";
import useCurrentUser from "@/hooks/useCurrentUser";
import useResponsiveWidth from "@/hooks/useResponsiveWidth";
import i18n from "@/i18n";
import { useFilterStore } from "@/store/module";
import { useMemoList, useMemoStore } from "@/store/v1";
import { Memo } from "@/types/proto/api/v2/memo_service";
import { useTranslate } from "@/utils/i18n";

interface GroupedByMonthItem {
  // Format: 2021-1
  month: string;
  data: Record<string, number>;
  memos: Memo[];
}

const groupByMonth = (dateCountMap: Record<string, number>, memos: Memo[]): GroupedByMonthItem[] => {
  const groupedByMonth: GroupedByMonthItem[] = [];

  Object.entries(dateCountMap).forEach(([date, count]) => {
    const month = date.split("-").slice(0, 2).join("-");
    const existingMonth = groupedByMonth.find((group) => group.month === month);
    if (existingMonth) {
      existingMonth.data[date] = count;
    } else {
      const monthMemos = memos.filter((memo) => getNormalizedTimeString(memo.displayTime).startsWith(month));
      groupedByMonth.push({ month, data: { [date]: count }, memos: monthMemos });
    }
  });

  return groupedByMonth.filter((group) => group.memos.length > 0).sort((a, b) => getTimeStampByDate(b.month) - getTimeStampByDate(a.month));
};

const Timeline = () => {
  const t = useTranslate();
  const { md } = useResponsiveWidth();
  const user = useCurrentUser();
  const memoStore = useMemoStore();
  const memoList = useMemoList();
  const filterStore = useFilterStore();
  const [activityStats, setActivityStats] = useState<Record<string, number>>({});
  const [selectedDay, setSelectedDay] = useState<string | undefined>();
  const [isRequesting, setIsRequesting] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const { tag: tagQuery, text: textQuery } = filterStore.state;
  const sortedMemos = memoList.value.sort((a, b) => getTimeStampByDate(b.displayTime) - getTimeStampByDate(a.displayTime));
  const groupedByMonth = groupByMonth(activityStats, sortedMemos);

  useEffect(() => {
    memoList.reset();
    fetchMemos();
  }, [selectedDay, tagQuery, textQuery]);

  useEffect(() => {
    (async () => {
      const filters = [`row_status == "NORMAL"`];
      const contentSearch: string[] = [];
      if (tagQuery) {
        contentSearch.push(`"#${tagQuery}"`);
      }
      if (textQuery) {
        contentSearch.push(`"${textQuery}"`);
      }
      if (contentSearch.length > 0) {
        filters.push(`content_search == [${contentSearch.join(", ")}]`);
      }
      const { stats } = await memoServiceClient.getUserMemosStats({
        name: user.name,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        filter: filters.join(" && "),
      });
      setActivityStats(stats);
    })();
  }, [sortedMemos.length]);

  const fetchMemos = async () => {
    const filters = [`creator == "${user.name}"`, `row_status == "NORMAL"`];
    const contentSearch: string[] = [];
    if (tagQuery) {
      contentSearch.push(`"#${tagQuery}"`);
    }
    if (textQuery) {
      contentSearch.push(`"${textQuery}"`);
    }
    if (contentSearch.length > 0) {
      filters.push(`content_search == [${contentSearch.join(", ")}]`);
    }
    if (selectedDay) {
      const selectedDateStamp = getTimeStampByDate(selectedDay) + new Date().getTimezoneOffset() * 60 * 1000;
      filters.push(
        ...[`display_time_after == ${selectedDateStamp / 1000}`, `display_time_before == ${(selectedDateStamp + DAILY_TIMESTAMP) / 1000}`]
      );
    }
    setIsRequesting(true);
    const data = await memoStore.fetchMemos({
      filter: filters.join(" && "),
      limit: DEFAULT_MEMO_LIMIT,
      offset: memoList.size(),
    });
    setIsRequesting(false);
    setIsComplete(data.length < DEFAULT_MEMO_LIMIT);
  };

  const handleNewMemo = () => {
    showMemoEditorDialog({});
  };

  return (
    <section className="@container w-full max-w-5xl min-h-full flex flex-col justify-start items-center sm:pt-3 md:pt-6 pb-8">
      <MobileHeader />
      <div className="w-full px-4 sm:px-6">
        <div className="w-full shadow flex flex-col justify-start items-start px-4 py-3 rounded-xl bg-white dark:bg-zinc-800 text-black dark:text-gray-300">
          <div className="relative w-full flex flex-row justify-between items-center">
            <div>
              <div
                className="py-1 flex flex-row justify-start items-center select-none opacity-80"
                onClick={() => setSelectedDay(undefined)}
              >
                <Icon.GanttChartSquare className="w-6 h-auto mr-1 opacity-80" />
                <span className="text-lg">{t("timeline.title")}</span>
              </div>
            </div>
            <div className="flex justify-end items-center gap-2">
              <IconButton variant="outlined" size="sm" onClick={() => handleNewMemo()}>
                <Icon.Plus className="w-5 h-auto" />
              </IconButton>
            </div>
          </div>
          <div className="w-full h-auto flex flex-col justify-start items-start">
            <MemoFilter className="px-2 my-4" />

            {groupedByMonth.map((group, index) => (
              <Fragment key={group.month}>
                <div className={classNames("flex justify-start items-start w-full mt-2 last:mb-4", md ? "flex-row" : "flex-col")}>
                  <div className={classNames("flex shrink-0", md ? "flex-col w-32 pr-4 pl-2 pb-8" : "flex-row w-full pl-1 mt-2 mb-2")}>
                    <div className={classNames("w-full flex flex-col", md && "mt-4 mb-2")}>
                      <span className="font-medium text-3xl leading-none mb-1">
                        {new Date(group.month).toLocaleString(i18n.language, { month: "short" })}
                      </span>
                      <span className="opacity-60">{new Date(group.month).getFullYear()}</span>
                      <span className="text-xs opacity-40">Total: {sum(Object.values(group.data))}</span>
                    </div>
                    <ActivityCalendar month={group.month} data={group.data} onClick={(date) => setSelectedDay(date)} />
                  </div>

                  <div className={classNames("flex flex-col justify-start items-start", md ? "w-[calc(100%-8rem)]" : "w-full")}>
                    {group.memos.map((memo, index) => (
                      <div
                        key={`${memo.id}-${memo.createTime}`}
                        className={classNames("relative w-full flex flex-col justify-start items-start pl-4 sm:pl-10 pt-0")}
                      >
                        <MemoView className="!border !border-gray-100 dark:!border-zinc-700" memo={memo} />
                        {group.memos.length > 1 && (
                          <div className="absolute -left-2 sm:left-2 top-4 h-full">
                            {index !== group.memos.length - 1 && (
                              <div className="absolute top-2 left-[7px] h-full w-0.5 bg-gray-200 dark:bg-gray-700 block"></div>
                            )}
                            <div className="border-4 rounded-full border-white relative dark:border-zinc-800">
                              <Icon.Circle className="w-2 h-auto bg-gray-200 text-gray-200 dark:bg-gray-700 dark:text-gray-700 rounded-full" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {index !== groupedByMonth.length - 1 && <Divider className="w-full !my-4 md:!mb-8 !bg-gray-100 dark:!bg-zinc-700" />}
              </Fragment>
            ))}
            {isRequesting ? (
              <div className="flex flex-col justify-start items-center w-full my-4">
                <p className="text-sm text-gray-400 italic">{t("memo.fetching-data")}</p>
              </div>
            ) : isComplete ? (
              sortedMemos.length === 0 && (
                <div className="w-full mt-12 mb-8 flex flex-col justify-center items-center italic">
                  <Empty />
                  <p className="mt-2 text-gray-600 dark:text-gray-400">{t("message.no-data")}</p>
                </div>
              )
            ) : (
              <div className="w-full flex flex-row justify-center items-center my-4">
                <Button variant="plain" endDecorator={<Icon.ArrowDown className="w-5 h-auto" />} onClick={fetchMemos}>
                  {t("memo.fetch-more")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Timeline;
